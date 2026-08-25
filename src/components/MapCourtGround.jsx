// src/components/MapCourtGround.jsx
//
// The painted court that backs the Map screen's loading state.
//
// This is a different treatment from <CourtLines>: not thin decorative arcs
// over a normal background, but a full-bleed stylised aerial — a street grid
// with two courts painted into it, plus one key and its arc picked out in the
// accent colour. Canvas source: design/LiveHoops Redesign.dc.html line 186.
//
// Where it renders is a deliberate decision. In the canvas this artwork IS the
// map, because the mockup has no Mapbox under it. In the real app it renders
// only inside .map-loading — the overlay that already covers the map while
// tiles download. That is the one moment the app genuinely has no map to show,
// so the artwork stands in exactly where the canvas intended and then gets out
// of the way. It never replaces or sits behind live tiles.
//
// Colours live in index.css rather than in presentation attributes here. The
// canvas's greys are hardcoded near-blacks (#0F1116, #131A16, #1B1E25,
// #171A20) that would be wrong in light theme; they are mapped onto the
// existing surface tokens instead, so the artwork works in both themes and
// follows the user's accent. The ground colour is dropped entirely — the
// .map-loading overlay already paints var(--bg).

export default function MapCourtGround() {
  return (
    <svg
      className="map-court-ground"
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* The two painted courts. Green because a court is where play happens,
          at an opacity low enough it never reads as "a game is live". */}
      <rect className="map-court-ground__court" x="18"  y="200" width="150" height="190" />
      <rect className="map-court-ground__court" x="215" y="470" width="160" height="150" />

      {/* Major streets. */}
      <g className="map-court-ground__street">
        <path d="M-10 150 H400" />
        <path d="M-10 420 H400" />
        <path d="M-10 660 H400" />
        <path d="M90 -10 V860" />
        <path d="M255 -10 V860" />
      </g>

      {/* Minor streets. */}
      <g className="map-court-ground__street map-court-ground__street--minor">
        <path d="M-10 285 H400" />
        <path d="M-10 545 H400" />
        <path d="M175 -10 V860" />
        <path d="M330 -10 V860" />
      </g>

      {/* The key and its arc on the upper court, in the chosen accent. */}
      <g className="map-court-ground__key">
        <path d="M60 250 h66 v90 H60 z" />
        <path d="M93 250 a 30 30 0 0 1 0 90" />
      </g>
    </svg>
  );
}
