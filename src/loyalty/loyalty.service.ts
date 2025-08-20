import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../clients/client.schema';
import {
  LoyaltyTransaction,
  LoyaltyTransactionDocument,
} from './loyalty-transaction.schema';
import { EnrollDto } from './dto/enroll.dto';
import { RedeemDto } from './dto/redeem.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(LoyaltyTransaction.name)
    private readonly txModel: Model<LoyaltyTransactionDocument>,
    private readonly audit: AuditService,
  ) {}

  async enroll(dto: EnrollDto) {
    const clientId = new Types.ObjectId(dto.clientId);
    const clientDoc = await this.clientModel.findById(clientId);
    if (!clientDoc) throw new NotFoundException('Client not found');

    const client = clientDoc.toObject() as Client;
    const now = new Date();
    const update: Record<string, unknown> = {
      'loyalty.enrolled': true,
      'loyalty.lastActivityAt': now,
    };
    if (dto.cardId !== undefined) update['loyalty.cardId'] = dto.cardId;
    if (!client.loyalty?.enrolled) update['loyalty.enrolledAt'] = now;

    const updated = await this.clientModel
      .findByIdAndUpdate(clientId, { $set: update }, { new: true })
      .lean();

    await this.audit.log({
      action: 'loyalty.enroll',
      resource: 'loyalty',
      resourceId: clientId,
      before: client,
      after: updated,
    });

    return { enrolled: true, client: updated };
  }

  async redeem(dto: RedeemDto) {
    const clientId = new Types.ObjectId(dto.clientId);
    const points = dto.points;
    const clientDoc = await this.clientModel.findById(clientId);
    if (!clientDoc) throw new NotFoundException('Client not found');
    const client = clientDoc.toObject() as Client;
    if (!client.loyalty?.enrolled)
      throw new BadRequestException('Client is not enrolled in loyalty');
    if ((client.loyalty.points ?? 0) < points)
      throw new BadRequestException('Insufficient points');

    // First try to create the transaction (idempotent)
    try {
      const tx = await this.txModel.create({
        clientId,
        type: 'redeem',
        points,
        reason: dto.reason,
        idempotencyKey: dto.idempotencyKey,
      });

      // Apply the redemption to the client atomically
      const now = new Date();
      const res = await this.clientModel.updateOne(
        { _id: clientId, 'loyalty.points': { $gte: points } },
        {
          $inc: {
            'loyalty.points': -points,
            'loyalty.totalRedeemed': points,
          },
          $set: { 'loyalty.lastActivityAt': now },
        },
      );
      if (res.matchedCount === 0) {
        // rollback: best effort delete the tx we just created
        await this.txModel.deleteOne({ _id: tx._id }).exec();
        throw new BadRequestException('Insufficient points');
      }

      const updatedClient = await this.clientModel.findById(clientId).lean();
      await this.audit.log({
        action: 'loyalty.redeem',
        resource: 'loyalty',
        resourceId: clientId,
        before: client,
        after: { transaction: tx.toObject(), client: updatedClient },
      });
      return { transaction: tx.toObject(), client: updatedClient };
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      // Duplicate key (idempotency)
      if (code === 11000) {
        const existing = await this.txModel
          .findOne({ idempotencyKey: dto.idempotencyKey })
          .lean();
        const currentClient = await this.clientModel.findById(clientId).lean();
        await this.audit.log({
          action: 'loyalty.redeem.idempotent',
          resource: 'loyalty',
          resourceId: clientId,
          before: client,
          after: { transaction: existing, client: currentClient },
        });
        return {
          transaction: existing,
          client: currentClient,
          idempotent: true,
        };
      }
      throw err;
    }
  }

  async transactions(q: QueryTransactionsDto) {
    const clientId = new Types.ObjectId(q.clientId);
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.txModel
        .find({ clientId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.txModel.countDocuments({ clientId }),
    ]);

    return { items, total, page, limit };
  }
}
