# Data model

`LogEntry`: required string message; arbitrary optional string attributes. Accepted batches are copied atomically. Source positions remain stable until clear.

`LogFilter`: optional attributes record (each exact string or array of alternatives), optional case insensitive full text substring search. Criteria are copied and replaced atomically by setFilter; null disables criteria. Matching entries retain their source indexes.

`LayoutEntry`: source index, measured lines per displayed cell, variable height. Tabular height is the tallest cell line count times measured line height plus the measured cell inset (16px by default). Plain height is the concatenated text line count times line height; no inter-entry gap.

`LineIndex`: cumulative pixel offsets starting at zero. Binary lookup maps scroll offsets to source layout positions.

State: retained entries, filter and display mode, matching count, displayed columns, measured geometry, virtual window, tail-follow flag. Each layout entry records whether it is highlighted. Filter mode indexes matches only; highlight mode indexes all entries and marks matches. No saved-filter entities, slots or statistics state.
