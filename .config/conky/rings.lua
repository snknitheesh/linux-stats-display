-- ============================================================
-- CYBERPUNK NEON STATS DISPLAY
-- Animated ring gauges with glow, pulse, and sweep effects
-- ============================================================

require 'cairo'

-- ============================================================
-- COLOR PALETTE
-- ============================================================
local CYAN       = 0x00f0ff
local MAGENTA    = 0xff00ff
local NEON_GREEN = 0x00ff88
local ELECTRIC   = 0x4488ff
local HOT_PINK   = 0xff0066
local ORANGE     = 0xff8800
local PURPLE     = 0xaa44ff
local WHITE      = 0xffffff
local BG_RING    = 0x1a1a2e

-- ============================================================
-- RING GAUGE DEFINITIONS
-- ============================================================
settings_table = {
    {
        name='cpu', arg='cpu0',
        label='CPU', unit='%',
        max=100,
        fg_colour=CYAN,
        bg_colour=BG_RING, bg_alpha=0.3,
        fg_alpha=0.9,
        x=100, y=210, radius=52, thickness=8,
        start_angle=135, end_angle=405,
        glow_colour=CYAN,
        dynamic_color=true,
    },
    {
        name='memperc', arg='',
        label='RAM', unit='%',
        max=100,
        fg_colour=MAGENTA,
        bg_colour=BG_RING, bg_alpha=0.3,
        fg_alpha=0.9,
        x=270, y=210, radius=52, thickness=8,
        start_angle=135, end_angle=405,
        glow_colour=MAGENTA,
        dynamic_color=true,
    },
    {
        name='execi',
        arg='5 nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits',
        label='GPU', unit='%',
        max=100,
        fg_colour=NEON_GREEN,
        bg_colour=BG_RING, bg_alpha=0.3,
        fg_alpha=0.9,
        x=440, y=210, radius=52, thickness=8,
        start_angle=135, end_angle=405,
        glow_colour=NEON_GREEN,
        dynamic_color=true,
    },
    {
        name='execi',
        arg='5 sensors | grep "Tctl:" | awk \'{print $2}\' | cut -c 2-3',
        label='CPU TMP', unit='\xC2\xB0C',
        max=100,
        fg_colour=HOT_PINK,
        bg_colour=BG_RING, bg_alpha=0.3,
        fg_alpha=0.9,
        x=610, y=210, radius=52, thickness=8,
        start_angle=135, end_angle=405,
        glow_colour=HOT_PINK,
        dynamic_color=true,
    },
    {
        name='execi',
        arg='5 nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits',
        label='GPU TMP', unit='\xC2\xB0C',
        max=100,
        fg_colour=ORANGE,
        bg_colour=BG_RING, bg_alpha=0.3,
        fg_alpha=0.9,
        x=780, y=210, radius=52, thickness=8,
        start_angle=135, end_angle=405,
        glow_colour=ORANGE,
        dynamic_color=true,
    },
    {
        name='execi',
        arg='5 nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits | cut -d "." -f1',
        label='GPU PWR', unit='W',
        max=600,
        fg_colour=PURPLE,
        bg_colour=BG_RING, bg_alpha=0.3,
        fg_alpha=0.9,
        x=950, y=210, radius=52, thickness=8,
        start_angle=135, end_angle=405,
        glow_colour=PURPLE,
        dynamic_color=false,
    },
    {
        name='execi',
        arg='5 sensors | grep "PPT:" | awk \'{print $2}\' | cut -d "." -f1',
        label='CPU PWR', unit='W',
        max=300,
        fg_colour=ELECTRIC,
        bg_colour=BG_RING, bg_alpha=0.3,
        fg_alpha=0.9,
        x=1120, y=210, radius=52, thickness=8,
        start_angle=135, end_angle=405,
        glow_colour=ELECTRIC,
        dynamic_color=false,
    },
}

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

function rgb_to_r_g_b(colour, alpha)
    return ((colour / 0x10000) % 0x100) / 255.0,
           ((colour / 0x100) % 0x100) / 255.0,
           (colour % 0x100) / 255.0, alpha
end

function lerp_color(c1, c2, t)
    local r1, g1, b1 = (c1 / 0x10000) % 0x100, (c1 / 0x100) % 0x100, c1 % 0x100
    local r2, g2, b2 = (c2 / 0x10000) % 0x100, (c2 / 0x100) % 0x100, c2 % 0x100
    local r = r1 + (r2 - r1) * t
    local g = g1 + (g2 - g1) * t
    local b = b1 + (b2 - b1) * t
    return math.floor(r) * 0x10000 + math.floor(g) * 0x100 + math.floor(b)
end

function get_dynamic_color(value)
    if value < 40 then
        return NEON_GREEN
    elseif value < 65 then
        return lerp_color(NEON_GREEN, ORANGE, (value - 40) / 25)
    elseif value < 85 then
        return lerp_color(ORANGE, 0xff2200, (value - 65) / 20)
    else
        return 0xff0033
    end
end

-- ============================================================
-- DRAWING FUNCTIONS
-- ============================================================

function draw_centered_text(cr, text, cx, cy, font_size, color, alpha, weight)
    weight = weight or CAIRO_FONT_WEIGHT_BOLD
    cairo_select_font_face(cr, "DejaVu Sans Mono", CAIRO_FONT_SLANT_NORMAL, weight)
    cairo_set_font_size(cr, font_size)
    local char_w = font_size * 0.602
    local text_w = string.len(text) * char_w
    local x = cx - text_w / 2
    local y = cy + font_size * 0.35
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha))
    cairo_move_to(cr, x, y)
    cairo_show_text(cr, text)
    cairo_stroke(cr)
end

function draw_segmented_ring(cr, value, pt, time, ring_index)
    local segments = 30
    local gap = 2.5
    local start_angle = pt.start_angle * math.pi / 180
    local end_angle = pt.end_angle * math.pi / 180
    local arc_length = (end_angle - start_angle) / segments
    local active_segments = math.floor(value * segments + 0.5)
    local fg_color = pt.fg_colour
    local pct = value * pt.max

    -- Breathing glow: entire ring gently pulses
    local breath = 0.5 + 0.5 * math.sin(time * 1.5 + ring_index * 0.9)

    -- Subtle gauge face fill (pulses slightly)
    cairo_arc(cr, pt.x, pt.y, pt.radius - pt.thickness, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.02 + 0.02 * breath))
    cairo_fill(cr)

    -- Background segments
    for i = 1, segments do
        local a1 = start_angle + (i - 1) * arc_length
        local a2 = a1 + arc_length - (gap * math.pi / 180)
        cairo_arc(cr, pt.x, pt.y, pt.radius, a1, a2)
        cairo_set_line_width(cr, pt.thickness)
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(pt.bg_colour, pt.bg_alpha))
        cairo_stroke(cr)
    end

    -- Active segments with breathing glow
    for i = 1, active_segments do
        local a1 = start_angle + (i - 1) * arc_length
        local a2 = a1 + arc_length - (gap * math.pi / 180)

        -- Glow layer (breathes)
        cairo_arc(cr, pt.x, pt.y, pt.radius, a1, a2)
        cairo_set_line_width(cr, pt.thickness + 5 + 2 * breath)
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.08 + 0.06 * breath))
        cairo_stroke(cr)

        -- Main segment
        cairo_arc(cr, pt.x, pt.y, pt.radius, a1, a2)
        cairo_set_line_width(cr, pt.thickness)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, pt.fg_alpha))
        cairo_stroke(cr)
    end

    -- Pulsing alarm glow when value > 80%
    if pct > 80 then
        local pulse = 0.5 + 0.5 * math.sin(time * 4)
        local active_end = start_angle + value * (end_angle - start_angle)
        cairo_arc(cr, pt.x, pt.y, pt.radius, start_angle, active_end)
        cairo_set_line_width(cr, pt.thickness + 10 + 4 * pulse)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(0xff0033, 0.06 + 0.06 * pulse))
        cairo_stroke(cr)
    end

    -- === SPINNING ORBIT DOT ===
    -- A bright dot that continuously orbits the ring on the outer track
    local orbit_radius = pt.radius + pt.thickness + 8
    local orbit_speed = 1.2 + (value * 1.5)  -- faster when value is higher
    local orbit_angle = start_angle + ((time * orbit_speed + ring_index * 1.3) % (2 * math.pi))
    -- Keep orbit within the ring arc range
    local arc_range = end_angle - start_angle
    local orbit_pos = start_angle + ((time * orbit_speed + ring_index * 1.3) % arc_range)

    local ox = pt.x + orbit_radius * math.cos(orbit_pos)
    local oy = pt.y + orbit_radius * math.sin(orbit_pos)

    -- Orbit dot trail (fading tail behind the dot)
    for t = 1, 4 do
        local trail_angle = orbit_pos - t * 0.08
        local tx = pt.x + orbit_radius * math.cos(trail_angle)
        local ty = pt.y + orbit_radius * math.sin(trail_angle)
        local trail_alpha = 0.15 - t * 0.03
        cairo_arc(cr, tx, ty, 2.5 - t * 0.3, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, trail_alpha))
        cairo_fill(cr)
    end

    -- Orbit dot outer glow
    cairo_arc(cr, ox, oy, 5, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.2))
    cairo_fill(cr)

    -- Orbit dot core
    cairo_arc(cr, ox, oy, 2.5, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(WHITE, 0.85))
    cairo_fill(cr)

    -- === PULSATING INDICATOR DOT at end of active arc ===
    if active_segments > 0 then
        local active_end = start_angle + value * (end_angle - start_angle)
        local dx = pt.x + pt.radius * math.cos(active_end)
        local dy = pt.y + pt.radius * math.sin(active_end)
        local pulse = 0.5 + 0.5 * math.sin(time * 3 + ring_index * 0.8)

        -- Outer glow
        cairo_arc(cr, dx, dy, 3 + pulse * 3, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.25 * pulse))
        cairo_fill(cr)

        -- Core dot
        cairo_arc(cr, dx, dy, 2.5, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(WHITE, 0.7 + 0.3 * pulse))
        cairo_fill(cr)
    end

    -- Decorative inner thin ring (breathes)
    cairo_arc(cr, pt.x, pt.y, pt.radius - pt.thickness - 3, start_angle, end_angle)
    cairo_set_line_width(cr, 1)
    cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.10 + 0.08 * breath))
    cairo_stroke(cr)

    -- Decorative outer thin ring (breathes)
    cairo_arc(cr, pt.x, pt.y, pt.radius + pt.thickness + 3, start_angle, end_angle)
    cairo_set_line_width(cr, 1)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.08 + 0.06 * breath))
    cairo_stroke(cr)
end

function draw_glow_line(cr, x1, y, x2, color, alpha, time)
    time = time or 0
    local breath = 0.5 + 0.5 * math.sin(time * 1.2)
    -- Wide glow (breathes)
    cairo_move_to(cr, x1, y)
    cairo_line_to(cr, x2, y)
    cairo_set_line_width(cr, 3 + breath)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * (0.15 + 0.1 * breath)))
    cairo_stroke(cr)
    -- Core line
    cairo_move_to(cr, x1, y)
    cairo_line_to(cr, x2, y)
    cairo_set_line_width(cr, 1)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * (0.5 + 0.2 * breath)))
    cairo_stroke(cr)
end

function draw_corner_bracket(cr, x, y, size, color, alpha, flip_x, flip_y, time)
    time = time or 0
    local breath = 0.5 + 0.5 * math.sin(time * 1.8)
    local dx = flip_x and -size or size
    local dy = flip_y and -size or size
    cairo_move_to(cr, x + dx, y)
    cairo_line_to(cr, x, y)
    cairo_line_to(cr, x, y + dy)
    cairo_set_line_width(cr, 2)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * (0.7 + 0.3 * breath)))
    cairo_stroke(cr)
    -- Corner glow dot
    cairo_arc(cr, x, y, 2 + breath, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, 0.2 + 0.15 * breath))
    cairo_fill(cr)
end

function draw_scan_line(cr, time, width, height)
    local period = 8
    local scan_x = ((time % period) / period) * (width + 200) - 100
    local gradient = cairo_pattern_create_linear(scan_x - 100, 0, scan_x + 100, 0)
    cairo_pattern_add_color_stop_rgba(gradient, 0, 0, 0.94, 1, 0)
    cairo_pattern_add_color_stop_rgba(gradient, 0.5, 0, 0.94, 1, 0.05)
    cairo_pattern_add_color_stop_rgba(gradient, 1, 0, 0.94, 1, 0)
    cairo_rectangle(cr, scan_x - 100, 0, 200, height)
    cairo_set_source(cr, gradient)
    cairo_fill(cr)
    cairo_pattern_destroy(gradient)
end

-- ============================================================
-- MAIN DRAW FUNCTION
-- ============================================================

function conky_draw_ring_stats()
    if conky_window == nil then return end

    local cs = cairo_xlib_surface_create(
        conky_window.display, conky_window.drawable,
        conky_window.visual, conky_window.width, conky_window.height
    )
    local cr = cairo_create(cs)

    local time = os.clock()
    local w = conky_window.width
    local h = conky_window.height

    -- Animated scan line sweep
    draw_scan_line(cr, time, w, h)

    -- Corner bracket decorations (with breathing glow)
    local s = 25
    local rx = w - 15
    local by = 790
    draw_corner_bracket(cr, 15, 15, s, CYAN, 0.5, false, false, time)
    draw_corner_bracket(cr, rx, 15, s, CYAN, 0.5, true, false, time)
    draw_corner_bracket(cr, 15, by, s, CYAN, 0.5, false, true, time)
    draw_corner_bracket(cr, rx, by, s, CYAN, 0.5, true, true, time)

    -- Horizontal divider lines (with breathing glow)
    draw_glow_line(cr, 30, 140, rx - 15, CYAN, 0.4, time)
    draw_glow_line(cr, 30, 295, rx - 15, CYAN, 0.4, time)
    draw_glow_line(cr, 30, by, rx - 15, CYAN, 0.4, time)

    -- Vertical divider between left/right panels
    local vbreath = 0.5 + 0.5 * math.sin(time * 1.2)
    cairo_move_to(cr, 650, 310)
    cairo_line_to(cr, 650, h - 40)
    cairo_set_line_width(cr, 1)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(CYAN, 0.10 + 0.08 * vbreath))
    cairo_stroke(cr)

    -- Draw ring gauges
    for i, pt in ipairs(settings_table) do
        local value
        if pt.arg == '' then
            value = tonumber(conky_parse('${' .. pt.name .. '}'))
        else
            value = tonumber(conky_parse('${' .. pt.name .. ' ' .. pt.arg .. '}'))
        end

        if value ~= nil then
            if pt.dynamic_color then
                pt.fg_colour = get_dynamic_color(value)
            else
                pt.fg_colour = pt.glow_colour
            end

            draw_segmented_ring(cr, value / pt.max, pt, time, i)

            -- Value text inside ring
            draw_centered_text(cr, tostring(math.floor(value)), pt.x, pt.y - 4, 20, pt.fg_colour, 1)

            -- Unit text below value
            draw_centered_text(cr, pt.unit, pt.x, pt.y + 16, 10, WHITE, 0.4, CAIRO_FONT_WEIGHT_NORMAL)

            -- Label above ring
            draw_centered_text(cr, pt.label, pt.x, pt.y - pt.radius - 18, 11, WHITE, 0.7)
        end
    end

    cairo_destroy(cr)
    cairo_surface_destroy(cs)
end
