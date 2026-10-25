# Z'kar's three-hex deployment (and any other three-hex summon, e.g. Galatian)

Source: the "Where will Galatian spawn?" graphic (six numbered diagrams plus a key). Z'kar follows the same rule.
The key says: X = blocked hex, red = the hex you click, green = the two additional hexes the summon uses.

Hexes are **flat-topped** (flat edges up and down, points left and right), so every hex has six neighbours:
`N`, `NE`, `SE`, `S`, `SW`, `NW`. There is no neighbour directly east or west.

## Which hex can be clicked

Any free hex on the board, as long as the rule below finds room for the other two hexes.

## Rule

Let `H` be the clicked hex (red). A neighbour of `H` is **blocked** if any of these is true:
- a unit (friendly or enemy) stands on it,
- it can't be occupied (impassable / off the board),
- its elevation differs from `H`'s elevation.

(Fire does not block. A unit may stand on a fire hex.)

Z'kar occupies `H` plus **two** of `H`'s neighbours. The extra pair is the first one in this priority list whose
hexes are both unblocked:

| Priority | Extra hexes (green) | Diagram (row, column) |
|---|---|---|
| 1 | `N` + `NE` | 1, left |
| 2 | `N` + `NW` | 1, right |
| 3 | `S` + `SE` | 2, left |
| 4 | `S` + `SW` | 2, right |
| 5 | `NE` + `SE` | 3, right |
| 6 | `NW` + `SW` | 3, left |

If no pair is fully unblocked, Z'kar cannot be deployed on `H`.

Only the hexes of the chosen pair matter: for example if `N` and `NE` are free, the first diagram applies even
when `NW` is blocked.

## The six diagrams (X marks = the blocked hexes of that example)

| Diagram | Blocked (X) | Chosen |
|---|---|---|
| 1, left | nothing | `N` + `NE` |
| 1, right | `NE` | `N` + `NW` |
| 2, left | `N` | `S` + `SE` |
| 2, right | `N`, `SE` | `S` + `SW` |
| 3, right | `N`, `S` | `NE` + `SE` |
| 3, left | `N`, `S`, and one X drawn to the right of the red hex | `NW` + `SW` |

## Inferred from the graphic (confirm)

- The priority order is inferred: the graphic doesn't state it, but every example above is consistent with it.
- Diagram 3, left has an X drawn between where `NE` and `SE` would be. I read it as "`NE` and/or `SE` is
  blocked", which is what makes `NE` + `SE` (priority 5) unusable.
