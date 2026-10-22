import type { FoodVisual } from "@/utils/mealPresentation";
/** Original small vector ingredients. Every glyph is driven by the live food id. */
export function FoodArt({ kind }: { kind: FoodVisual }) {
  switch (kind) {
    case "chicken":
      return (
        <g>
          <path
            d="M-30-27Q10-44 29-16L33 17Q21 39-7 33L-32 13Z"
            fill="#dca766"
          />
          <path
            d="M-28-14L24-26M-32 2L32-11M-26 20L32 5M-9 33L28 21"
            stroke="#a86b35"
            strokeWidth="6"
          />
          <path
            d="M-21-22Q-5-32 8-27"
            stroke="#f3cd91"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      );
    case "beef":
      return (
        <g>
          <path
            d="M-35-15Q-15-42 10-29Q39-20 33 7Q26 36-5 31Q-35 27-35-15"
            fill="#8f4f37"
            stroke="#b77a51"
            strokeWidth="5"
          />
          <path
            d="M-25-10L16-23M-28 7L29-8M-16 24L25 8"
            stroke="#5b302b"
            strokeWidth="5"
          />
          <path
            d="M-14-18Q-2-6 5-15M-8 4Q4 15 16 3"
            stroke="#d6a786"
            fill="none"
            strokeWidth="3"
          />
        </g>
      );
    case "fish":
      return (
        <g>
          <path
            d="M-34 0Q-8-38 28-10L43-25L38 0L43 23L28 10Q-8 38-34 0"
            fill="#d6b883"
          />
          <path
            d="M-22-1Q-5-23 22-7M-23 9Q0-5 22 8"
            stroke="#b09568"
            fill="none"
            strokeWidth="3"
          />
          <circle cx="-21" cy="-3" r="3" fill="#31483d" />
          <path d="M-9-20L0-29L10-20" fill="#8da18b" />
        </g>
      );
    case "egg":
      return (
        <g>
          <path
            d="M-34-7Q-28-35-7-27Q15-39 31-12Q43 15 18 29Q-8 39-28 20Z"
            fill="#fff8dc"
          />
          <ellipse cy="1" rx="17" ry="18" fill="#edbc46" />
          <ellipse cx="-5" cy="-5" rx="6" ry="4" fill="#ffdc7b" />
        </g>
      );
    case "rice":
    case "oats":
      return (
        <g>
          <path
            d="M-34 18Q-34-33 0-35Q35-29 34 19Q9 37-34 18"
            fill={kind === "oats" ? "#ceb48a" : "#e5dfb7"}
          />
          {Array.from({ length: 18 }, (_, i) => (
            <path
              key={i}
              d={`M${-24 + (i % 6) * 9} ${-18 + Math.floor(i / 6) * 14}l-2 9`}
              stroke={kind === "oats" ? "#a38b63" : "#faf1cf"}
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
        </g>
      );
    case "bread":
      return (
        <g>
          <path
            d="M-30 28V-17Q-33-37 0-36Q34-37 31-17V28Z"
            fill="#ca9b56"
            stroke="#947039"
            strokeWidth="5"
          />
          <path d="M-20-18H20V21H-20Z" fill="#e7c58c" />
          {[-12, 0, 12].map((x) => (
            <path
              key={x}
              d={`M${x}-13v27`}
              stroke="#cbab74"
              strokeWidth="2"
              strokeDasharray="3 6"
            />
          ))}
        </g>
      );
    case "potato":
      return (
        <g>
          {[
            [-17, -10, 29],
            [15, 8, -28],
            [-13, 20, 62],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <ellipse rx="15" ry="25" fill="#e0c987" />
              <path
                d="M-5-16L-3 13M5-11L6 10"
                stroke="#f4e5b0"
                strokeWidth="3"
              />
            </g>
          ))}
        </g>
      );
    case "salad":
      return (
        <g>
          {[
            [-20, -12],
            [14, -16],
            [-9, 17],
            [22, 13],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x - 15} ${y}q-7-23 14-17q23-6 18 16q-9 23-32 1`}
              fill={i % 2 ? "#83ac58" : "#477e46"}
            />
          ))}
          <circle cx="12" cy="8" r="10" fill="#d76f45" />
          <circle
            cx="-17"
            cy="-8"
            r="10"
            fill="#c8d592"
            stroke="#5d944e"
            strokeWidth="4"
          />
        </g>
      );
    case "cheese":
      return (
        <g>
          <path d="M-32 21L-18-28L29-16L33 26Z" fill="#f2ebd0" />
          <path d="M-32 21L33 26L24 35L-29 30Z" fill="#d9d4b4" />
          {[
            [-12, 0],
            [13, 12],
            [-7, 20],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="4" fill="#d5cc9f" />
          ))}
        </g>
      );
    case "milk":
    case "powder":
      return (
        <g>
          <path d="M-23-30H23L19 33H-19Z" fill="#d3e0cf" opacity=".8" />
          <path
            d="M-19-12H19L16 29H-16Z"
            fill={kind === "powder" ? "#d6c49f" : "#f5f0df"}
          />
          <path d="M-15-24V21" stroke="white" strokeWidth="4" opacity=".5" />
          {kind === "powder" && (
            <path d="M10-15L20-44" stroke="#8d9f7b" strokeWidth="5" />
          )}
        </g>
      );
    case "yogurt":
    case "beans":
      return (
        <g>
          <ellipse cy="5" rx="36" ry="28" fill="#a0b99b" />
          <path d="M-36 3Q-30 42 0 38Q31 38 36 3" fill="#d8e1ce" />
          <ellipse
            cy="1"
            rx="31"
            ry="21"
            fill={kind === "beans" ? "#aa8050" : "#e4ebd7"}
          />
          {Array.from({ length: 12 }, (_, i) => (
            <ellipse
              key={i}
              cx={Math.sin(i * 4) * 23}
              cy={Math.cos(i * 3) * 13}
              rx="4"
              ry="2.5"
              fill={kind === "beans" ? "#755b39" : "#8eab78"}
            />
          ))}
        </g>
      );
    case "oil":
      return (
        <g>
          <ellipse cy="12" rx="22" ry="27" fill="#c5c78b" />
          <path d="M-9-19V-32H9V-19" fill="#b2b887" />
          <path d="M-19 4Q0-2 19 4L17 28Q0 38-17 28Z" fill="#b6b345" />
          <rect x="-11" y="-37" width="22" height="8" rx="3" fill="#577a50" />
        </g>
      );
    case "nuts":
    case "dates":
      return (
        <g>
          {[
            [-20, -10, 30],
            [12, -18, -20],
            [-7, 15, 40],
            [24, 14, -20],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
              <ellipse
                rx="12"
                ry="18"
                fill={kind === "dates" ? "#805233" : "#bd9362"}
              />
              <path
                d="M0-12Q-7 0 0 12"
                stroke={kind === "dates" ? "#573621" : "#7a5c39"}
                fill="none"
                strokeWidth="2"
              />
            </g>
          ))}
        </g>
      );
    case "apple":
      return (
        <g>
          <path
            d="M0-22Q28-40 34-10Q37 25 14 31Q1 25-12 32Q-38 20-33-8Q-29-38 0-22"
            fill="#cf6c4b"
          />
          <path d="M0-21L5-36" stroke="#685b34" strokeWidth="5" />
          <path d="M5-31Q9-48 27-36Q21-23 5-31" fill="#6f994e" />
        </g>
      );
    case "banana":
      return (
        <g transform="rotate(-25)">
          <path
            d="M-29-25Q-12 23 30-13Q30 24-3 33Q-40 30-29-25"
            fill="#e3cd6f"
          />
          <path
            d="M-25-15Q-9 29 24 0"
            stroke="#f1df9d"
            fill="none"
            strokeWidth="4"
          />
        </g>
      );
    case "avocado":
      return (
        <g>
          <path
            d="M-10-35Q8-45 19-12Q40 21 14 34Q-20 46-29 14Q-32-6-10-35"
            fill="#648448"
            stroke="#314b32"
            strokeWidth="4"
          />
          <path
            d="M-7-29Q7-34 13-8Q30 20 12 27Q-15 37-21 12Q-21-4-7-29"
            fill="#d4da8e"
          />
          <circle cx="2" cy="12" r="14" fill="#99764d" />
        </g>
      );
    default:
      return (
        <g>
          <rect x="-27" y="-24" width="54" height="48" rx="16" fill="#9ab18c" />
          <path
            d="M-12-6H12M-12 5H8"
            stroke="#dce6cf"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      );
  }
}
