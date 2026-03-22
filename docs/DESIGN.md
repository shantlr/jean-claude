```markdown
# Design System Strategy: The Kinetic Nocturne

## 1. Overview & Creative North Star
**Creative North Star: The Focused Observer**

This design system is engineered for high-intensity developer workflows where cognitive load must be minimized, and precision is paramount. We move beyond the "flat dashboard" trope by treating the UI as a high-fidelity instrument. 

To break the "template" look, we employ **Intentional Asymmetry**. Primary navigation and action centers are weighted to create a natural eye-path that mimics reading code. We reject the rigid grid in favor of **Layered Depth**, where the interface feels like a series of machined plates floating in a deep charcoal void. The vibrancy of the blue and purple accents serves as a "laser-focus" indicator—guiding the developer’s attention to active states and critical telemetry without overwhelming the workspace.

---

## 2. Colors

The palette is anchored in a deep, monochromatic charcoal to eliminate glare, with high-chroma accents used strictly for functional signaling.

### Tonal Hierarchy
- **Primary & Secondary:** `primary (#a3a6ff)` and `secondary (#c180ff)` are reserved for high-action states.
- **The "No-Line" Rule:** We explicitly prohibit 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts. For example, a sidebar using `surface-container-low` should sit directly against the `background` without a dividing line.
- **Surface Nesting:** Use the `surface-container` tiers to create "nested" depth.
    - **Base:** `surface` (#0e0e11)
    - **Inlaid Elements:** `surface-container-lowest` (#000000) for recessed areas like terminal outputs or code blocks.
    - **Elevated UI:** `surface-container-highest` (#25252a) for modals and pop-overs.
- **The Glass & Gradient Rule:** For main CTAs or "Active Workspace" headers, use a subtle linear gradient from `primary` to `primary_dim` at a 135-degree angle. Floating panels should utilize `surface_bright` with a 60% opacity and a `20px` backdrop-blur to create a "frosted obsidian" effect.

---

## 3. Typography

The system utilizes a dual-font strategy to balance technical precision with editorial authority.

- **Editorial Headlines (Manrope):** All `display` and `headline` scales use **Manrope**. This provides a geometric, modern feel that softens the "brutalist" nature of developer tools.
- **Functional Interface (Inter):** All `title`, `body`, and `label` scales use **Inter**. It is chosen for its exceptional legibility at small sizes and high x-height, essential for dense data environments.
- **Visual Contrast:** High-contrast sizing is key. Use `headline-lg` (2rem) for page titles directly adjacent to `label-sm` (0.6875rem) for metadata. This "Big/Small" typographic rhythm eliminates the middle-ground ambiguity found in generic templates.

---

## 4. Elevation & Depth

We eschew traditional drop shadows in favor of **Tonal Layering** and **Ambient Glows**.

- **The Layering Principle:** Stacking determines hierarchy. Place a `surface-container-high` card on a `surface-container` background to create a "soft lift."
- **Ambient Shadows:** When a component must float (e.g., a command palette), use a shadow tinted with the `on-surface` color: `box-shadow: 0 24px 48px rgba(252, 248, 252, 0.06)`. This mimics natural light reflecting off a dark surface rather than a "muddy" black shadow.
- **The "Ghost Border" Fallback:** If containment is strictly required for accessibility, use a "Ghost Border": `outline-variant` (#48474b) at 15% opacity. 
- **Active Focus:** For focused input fields or active code lines, use a 1px border of `primary_dim` with a 4px outer "glow" using the same color at 20% opacity.

---

## 5. Components

### Buttons
- **Primary:** Gradient-filled (`primary` to `primary_dim`). Roundedness: `md` (0.375rem).
- **Secondary:** Ghost style. Transparent background with a `Ghost Border` and `on_surface` text.
- **Tertiary:** No background or border. `primary` text. Transitions to `surface_variant` on hover.

### Input Fields
- **Container:** `surface_container_high`.
- **States:** On focus, the background shifts to `surface_container_highest` and the bottom edge receives a 2px `primary` accent line.
- **Forbid:** Do not use 4-sided high-contrast borders for inputs; let the background shift do the work.

### Cards & Lists
- **Separation:** Forbid the use of divider lines. Separate items using `Spacing 4` (0.9rem) or a background shift from `surface` to `surface_container_low`.
- **Interactive Items:** List items should use a subtle horizontal slide (2px) and color shift to `primary_container` on hover.

### Code Terminals (Custom Component)
- **Background:** `surface_container_lowest` (#000000).
- **Accents:** Use `tertiary` (#c6fff3) for success messages and `error_dim` (#d73357) for stack traces to maintain high-efficiency scannability.

---

## 6. Do's and Don'ts

### Do
- **Do** use `rounded-xl` (0.75rem) for large outer containers and `rounded-sm` (0.125rem) for small internal elements like tags to create a "nested" visual logic.
- **Do** leverage whitespace from the Spacing Scale (specifically `spacing-8` and `spacing-10`) to let complex data "breathe."
- **Do** use `surface_tint` at 5% opacity as an overlay for hovering over interactive surfaces.

### Don't
- **Don't** use pure white (#ffffff) for text. Always use `on_surface` (#fcf8fc) to prevent eye strain in dark environments.
- **Don't** use standard "drop shadows" on cards. Rely on the "No-Line" rule and color transitions.
- **Don't** use more than two accent colors (Blue/Purple) in a single view unless signaling an error or success state.
- **Don't** use `DEFAULT` roundedness for everything. Variation in corner radius is what makes the system feel custom.```