# Dapper patterns

## Connection factory

Expose narrow async connection creation owned by database adapter. Keep connection string retrieval/secret provider outside query classes. Open late, dispose early.

## Explicit transaction orchestration

Application use case requests database unit capable of beginning transaction. Database adapter owns connection plus transaction; stores receive both explicitly. Commit once. Never create hidden independent connections inside participating stores.

## Read models

Project directly into purpose-built immutable read models. Keep SQL aliases explicit. For multi-mapping, set split boundary explicitly and test duplicate/optional child behavior.

## Dynamic queries

Build predicates from fixed fragments selected by typed inputs. Values remain parameters. Identifier/table/column/direction tokens require closed mapping; parameters cannot protect SQL identifiers.

## Performance evidence

Capture representative cardinality, elapsed time, logical reads, actual plan when needed, allocation/materialization behavior, and cancellation. Optimization without plan/data evidence is not acceptance.
