# C.Flex Store Manager

Responsive, installable store-management foundation for desktop and phone.

## Integrated modules

- Overview, POS, inventory, purchases, customers, suppliers and expenses
- Profit, stock value, low-stock alerts and decision reports
- Product/SKU/barcode structure and multi-location stock
- GHS reporting with CNY, USD and XOF configuration points
- Landed-cost, shipment, receiving and supplier-performance workflows
- Owner, manager and cashier roles with an audit-log structure
- IndexedDB offline queue with unique record IDs and safe reconnection handling
- Mobile-first navigation and an installable web-app manifest

## Production data connection

The user interface and device-level offline queue are complete. Connect the sync adapter in `db/schema.ts` to the chosen production database before accepting real transactions from multiple devices. The intended production pattern is append-only inventory movements, idempotent sync events and server-side role enforcement.

## Run

```bash
npm ci
npm run dev
```

Build verification:

```bash
npm run build
```
