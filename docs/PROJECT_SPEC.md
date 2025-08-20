# SFE — Spécification produit (backend NestJS + MongoDB)

## Objectif

Plateforme de facturation normalisée DGI, multi-tenant, robuste et sécurisée, intégrant:

- **Facturation** (FV/FT/FA/EV/ET/EA), mode **TTC** et **HT**.
- **Articles** (BIE/SER/TAX) mappés aux **groupes A–P**.
- **Clients** types **PP/PM/PC/PL/AO** (AO avec référence d’exonération).
- **Intégrations configurables par tenant**: **e-MCF (HTTP+JWT)** et **MCF matériel (série)**.
- **Devises**: base **CDF** (non modifiable), **USD** alternative non supprimable + autres devises + **taux** manuels horodatés.
- **Stock avancé** (BIE) : simple/lot/sérialisé, réceptions, transferts, ajustements, réservations optionnelles, valorisation **AVG** ou **FIFO**.
- **Fidélisation** intégrée au modèle `clients` (points earn/redeem paramétrables).
- **Paramètres** (settings) par tenant.
- **Audit & logs** Pino, idempotence, RFC7807, Swagger complet.

## Intégration e-MCF (HTTP)

- **Flux**: (optionnel) `GET /api/info/status` → `POST /api/invoice` (calcul totaux + `uid`) → `POST /api/invoice/{uid}/CONFIRM` ou `.../CANCEL`.
- **Contraintes**: **max 10 demandes en attente**; une demande **expire en ~2 minutes** si non finalisée.
- **Réponses**: totaux par groupe (A-I au minimum), `total`, `vtotal` → vérifier contre nos calculs avant `CONFIRM`. `CONFIRM` renvoie `dateTime`, `qrCode`, `codeDEFDGI`, `counters`, `nim`.
- **Infos**: `/api/info/*` (groupes de taxation, types facture/paiement/client/référence, types article, currencyRates).  
  _(Source: “e-MCF API 1.0” — statut, POST facture, finalisation, limites, endpoints info.)_

## Intégration MCF (matériel)

- **Protocole série** 115200 8N1. Séquence: **C1h** (état) → **C3h** (client) → **C0h** (début facture: type, mode, ISF, FN, **CRT/CDT** si USD) → **31h** (lignes) → **33h** (sous-total) → **35h** (paiements) → **38h** (finalisation/annulation).
- **Vérifs**: comparer sous-total `33h` à nos totaux. `38h` confirme si montants MV/MT correspondent.
- **Retour**: `FC,TC,FT,DT,MID,NIF,FN,SIG` → construire le **QR** `RDCDEF01;{MID};{SIG};{NIF};{DT}` (alphanumérique, ECC=M).  
  _(Source: “PROTOCOLE MCF-SFE” — commandes C1h..38h, sous-total, QR, timings SYN/NAK.)_

## Groupes, types, cas de test DGI

- **Groupes A–P**: A (exonéré), B (TVA 16%), C (TVA 8%), D (dérogatoire), E (export), F/G (marchés publics 16/8), H/I/J (consignation, garantie, débours), K (non-assujettis), **L (prélèvements sur ventes)**, **M (ventes à TVA spécifique)**, **N (TVA spécifique M)**, etc.
- **Types d’article**: **BIE** (biens), **SER** (services), **TAX** (taxes); **TAX autorisé uniquement sur L ou N**.
- **Types de facture**: FV, FT, FA, EV, ET, EA.
- **Types client**: PP, PM, PC, PL, **AO** (référence d’exonération obligatoire en commentaire A).
  _(Source: “Cas de test SFE v1.0”)_
