# Revised design decisions

User explicitly requires virtual scrolling with variable text heights, superseding the earlier nonvirtual direction. Existing core virtual-scroll controller assumes uniform heights and is therefore not used.

Text-only content enables measured line calculation instead of mounting all rows. Canvas measures font glyph widths, explicit line splitting determines row heights and a prefix index supports binary viewport selection. Visible rows are ordinary CSS grid entries; stretched cell containers bound sticky shorter text. Plain mode virtualizes line slices so one huge entry does not force its entire text into the DOM.

External components own controls. setFilter replaces exact attribute criteria and full text search; filtering preserves retained data. Columns control display independently from searchable fields.
