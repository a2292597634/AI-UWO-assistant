# Audit Report Format

Every audit finding carries these stable fields:

| Field           | Description                                            |
| --------------- | ------------------------------------------------------ |
| severity        | `error` or `warning`                                   |
| code            | Stable machine-readable error code                     |
| entityType      | Kind of entity (`officer`, `skill-mapping`, `dataset`) |
| entityId        | Entity identifier                                      |
| path            | JSON path to the defect                                |
| observedValue   | The value that triggered the finding                   |
| message         | Human-readable description                             |
| suggestedAction | Recommended resolution                                 |
