# AppDeploy Decoupling Brief

## Objective

Decouple QuestLedger from AppDeploy and establish an independent, hosting-agnostic backend and database architecture.

## Why Now

QuestLedger has moved beyond the prototype stage. Its core financial model is now established, including:

- Goals and allocations
- Unallocated money
- Recurring commitments
- Automatic and manual deductions
- Spending and rebalancing
- Immutable financial events
- Archives and historical records

A recent architectural review exposed a significant limitation in the current AppDeploy backend: money-moving operations rely on separate read-modify-write operations without guaranteed database transactions or concurrency control.

This creates potential problems such as:

- Concurrent requests overwriting each other's updates
- Partial failures leaving balances changed without corresponding history events
- Multi-record transfers that cannot be guaranteed to succeed or fail as one operation

For a financial application, these are fundamental correctness concerns.

Rather than building increasingly complex workarounds around AppDeploy, this is the appropriate point to establish a proper transactional backend.

## Target Architecture

Move from:

**React → AppDeploy API → AppDeploy Database**

to:

**React → QuestLedger API → PostgreSQL**

The backend should own the financial domain logic, while PostgreSQL provides the transactional guarantees required for money movement.

Financial operations should follow an atomic pattern:

**Validate → Begin Transaction → Lock/Read → Update Balances → Record Event → Commit**

If any step fails, the entire operation should roll back.

## Migration Principle

This should be a **decoupling**, not a rewrite of QuestLedger's product logic.

Preserve the existing:

- Domain model
- Financial rules
- User experience
- Event/history concepts
- Commitment and goal behaviour

Replace the AppDeploy-specific persistence and API infrastructure underneath them.

Existing financial history should be preserved during migration rather than treating the migration as a simple balance reset.

## Desired Outcome

QuestLedger should become:

- Independent of AppDeploy
- Deployable on multiple hosting platforms
- Backed by a proper transactional database
- Safe against concurrent money movements
- Consistent when operations partially fail
- Easier to test and evolve
- Suitable for future multi-device and multi-session usage

## Next Step

Before implementing the new backend, audit the current `future-centaur/QuestLedger` repository and classify:

1. AppDeploy-specific code
2. Reusable application/domain logic
3. Current database schema and data
4. API contracts used by the frontend
5. Financial operations requiring transactional treatment
6. Migration requirements for existing users and event history

Then define the new PostgreSQL/API architecture and migration path.
