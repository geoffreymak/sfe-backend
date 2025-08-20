# Règles DGI opérationnelles (implémentables)

## 1. Domaines et mappings

- **Groupes fiscaux (A–P)** avec taux/étiquettes; B=16%, C=8%, E=0%, L/M/N spécifiques.
- **Types facture**: FV, FT, FA, EV, ET, EA.
- **Types client**: PP, PM, PC, PL, AO.
- **Types article**: BIE, SER, TAX (TAX ⇢ **L|N uniquement**).

## 2. Contraintes de validation (au confirm)

- **AO**: si données client imprimées → **Réf. Exo obligatoire** (ligne commentaire A).
- **FA/EA**: Référence de la facture d’origine (Code DEF 24 chars) obligatoire **sauf** nature **RRR** où RN='RRR'.
- **TAX**: lignes TAX uniquement sur groupes **L** ou **N**.
- **Comparaison des totaux**:
  - e-MCF: comparer `total` et `vtotal` calculés vs retournés par `/api/invoice` avant `CONFIRM`.
  - MCF: comparer nos totaux vs retour `33h`; `38h` échoue si MV/MT divergents.

## 3. Intégrations

### e-MCF (HTTP+JWT)

- En-têtes: `Content-Type: application/json`, `Accept: application/json`, `Authorization: Bearer <token>`.
- **Statut** `/api/invoice` GET: version, NIF, NIM, validité du token, **pendingRequestsCount** et liste `uid`.
- **POST facture** `/api/invoice`: `InvoiceRequestDataDto` (vendeur.nif, rn, mode HT/TTC, isf, type, items[], client, operator, payment[], `curCode/curDate/curRate`), réponse `InvoiceResponseDataDto` (`uid`, totaux par groupe, `total`, `vtotal`).
- **Finalisation** `/api/invoice/{uid}/CONFIRM` (body `total`, `vtotal`) ou `.../CANCEL`. Réponse `FinalizeInvoiceResponseDataDto`: `dateTime`, `qrCode`, `codeDEFDGI`, `counters`, `nim`.
- **Limites**: max **10** en attente, expiration **~2 min** si pas de finalisation.

### MCF (Série)

- Commandes: **C1h** (état), **C3h** (client PP/PM/PC/PL/AO), **C0h** (démarrage: type FV/FA/FT/EV/EA/ET, mode **TTC/HT**, ISF, `FN`, **CRT/CDT USD**), **31h** (lignes BIE/SER/TAX + groupe A–P + T.S.), **33h** (sous-total global + par groupe + TVA + équivalent USD MCUR), **35h** (paiements E/V/C/M/D/A), **38h** (finaliser/annuler).
- QR à imprimer: `RDCDEF01;{MID};{SIG};{NIF};{DT}` (AlphaNumeric, ECC=M).

## 4. Devises

- Base **CDF** (non modifiable), **USD** alternative par défaut (non supprimable).
- Autres devises activables par tenant.
- Taux manuels (`fxRates`) avec `validFrom`. À la confirmation, si `equivalentCurrency.code` fourni: prendre **dernier taux** `<= now`, sinon **400**.

## 5. Fidélisation (sur `clients`)

- Activable par **settings**. Points **earn** à la confirmation (base HT/TTC, exclusions de groupes par paramètre), **redeem** idempotent (X-Idempotency-Key).

## 6. Multi-tenant

- `tenantId` sur **toutes** les collections. Filtre implicite par guard global + membership.

## 7. Idempotence

- `X-Idempotency-Key` pour `/invoices/:id/confirm` et opérations monétaires (paiement, redeem).
