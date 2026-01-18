# Main Layout Design

Phase 1.2 implementation: Sidebar, Header, and Content area layout.

## Component Hierarchy

```
__root.tsx (RootLayout)
├── MainSidebar
│   ├── ProjectTileList
│   │   └── ProjectTile (per project)
│   └── SidebarFooter
│       ├── AddProjectButton
│       └── SettingsButton
├── Header
│   ├── TrafficLights padding (macOS only)
│   └── UsagePlaceholder (right side, empty for now)
└── <Outlet /> (content area)
```

## Layout Structure

**Root layout (flexbox horizontal):**

- MainSidebar: fixed width 72px, full height, dark background (`neutral-900`)
- Right side: `flex-1 flex-col`
  - Header: fixed height 40px, draggable for window movement
  - Content: `flex-1 overflow-auto`

## MainSidebar

**Dimensions:**

- Width: 72px
- Full viewport height
- Background: `neutral-900` with right border (`neutral-700`)

**ProjectTile:**

- Size: 48x48px
- Border radius: 12px
- Background: project's stored color
- Content: 1-2 uppercase initials (e.g., "Idling" → "ID", "My App" → "MA")
- Font: bold, white, centered
- Hover: ring or brightness increase
- Active: white ring when project selected (via `data-status="active"`)

**Tile layout:**

- Centered horizontally in sidebar
- Vertical gap: 8px between tiles
- Padding: 12px top

**Sidebar footer (bottom-aligned):**

- Separator line above
- Add project button: 48x48, dashed border, "+" icon
- Settings button: 48x48, gear icon, navigates to `/settings`
- Gap: 8px between buttons
- Padding: 12px bottom

## Header

**Dimensions:**

- Height: 40px
- Full width of content area
- Background: `neutral-800` or transparent

**macOS traffic lights:**

- Left padding: 70px on `darwin` platform only
- Entire header is draggable (`-webkit-app-region: drag`)
- Interactive elements use `-webkit-app-region: no-drag`

**Right side:**

- Placeholder for Phase 4 usage/rate limits display

## Color System

**Palette for project tiles:**

```typescript
const PROJECT_COLORS = [
  '#5865F2', // blurple
  '#57F287', // green
  '#FEE75C', // yellow
  '#EB459E', // pink
  '#ED4245', // red
  '#9B59B6', // purple
  '#3498DB', // blue
  '#E67E22', // orange
  '#1ABC9C', // teal
];
```

**Assignment:**

- Random color from palette on project creation
- Stored in `projects.color` column
- User can change later (future feature)

## Database Changes

**Add to ProjectTable:**

```typescript
color: string; // hex color code
```

**Migration (002_project_color.ts):**

- Add `color` column to projects table
- Backfill existing projects with random colors from palette

## File Changes

**New files:**

- `src/components/MainSidebar.tsx`
- `src/components/ProjectTile.tsx`
- `src/components/Header.tsx`
- `src/lib/colors.ts` - color palette constant
- `electron/database/migrations/002_project_color.ts`

**Modified files:**

- `src/routes/__root.tsx` - integrate MainSidebar and Header
- `electron/database/schema.ts` - add color to ProjectTable
- `electron/preload.ts` - expose platform info
- `src/lib/api.ts` - update Project type

**New dependency:**

- `lucide-react` - icon library

## Icons Used

From Lucide:

- `Plus` - add project button
- `Settings` - settings button
