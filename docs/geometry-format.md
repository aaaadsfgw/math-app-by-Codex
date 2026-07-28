# Geometry document format

```json
{
  "id": "geometry-id",
  "template": "triangle",
  "points": {
    "A": { "x": 160, "y": 70 },
    "B": { "x": 70, "y": 260 },
    "C": { "x": 310, "y": 260 }
  },
  "segments": [
    { "id": "AB", "from": "A", "to": "B", "type": "side", "auxiliary": false }
  ],
  "constraints": [
    { "id": "c1", "type": "length", "target": "AB", "value": 5 },
    { "id": "c2", "type": "angle", "target": "A", "value": 60 }
  ],
  "query": { "type": "area", "target": "ABC" }
}
```

`points` and `segments` control display. `constraints` and `query` control mathematics. Supported constraint type names are `length`, `angle`, `perpendicular`, `parallel`, `equal-length`, `equal-angle`, `midpoint`, `tangent`, `on-circle`, `radius`, `diameter`, and `height`.

Initial triangle calculations consume numeric `length`, `angle`, and `height` conditions plus query types for area, perimeter, sides, angles, and height where sufficient information exists. Other conditions remain serializable and editable but are explicitly marked solver-unsupported.

