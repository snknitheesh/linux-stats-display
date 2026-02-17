-- ============================================================
-- CYBERPUNK NEON STATS DISPLAY v3 — SCI-FI EDITION
-- Multi-orbit particles, energy pulses, dual scan lines,
-- spinning rings, halos, and intense neon glow
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

-- Each ring gets a unique accent color for its orbiting particles
local ACCENT_COLORS = {
    {CYAN, ELECTRIC, 0x66ffff},
    {MAGENTA, HOT_PINK, 0xff88ff},
    {NEON_GREEN, 0x44ffaa, CYAN},
    {HOT_PINK, ORANGE, MAGENTA},
    {ORANGE, 0xffcc00, HOT_PINK},
    {PURPLE, MAGENTA, ELECTRIC},
    {ELECTRIC, CYAN, PURPLE},
}

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
    -- Text glow
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * 0.4))
    cairo_move_to(cr, x, y)
    cairo_show_text(cr, text)
    -- Main text
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
    local breath = 0.5 + 0.5 * math.sin(time * 2.0 + ring_index * 0.7)
    local accents = ACCENT_COLORS[ring_index] or {fg_color, fg_color, fg_color}

    -- === HALO / BLOOM behind active arc ===
    if active_segments > 0 then
        local active_end = start_angle + value * (end_angle - start_angle)
        -- Wide outer bloom
        cairo_arc(cr, pt.x, pt.y, pt.radius, start_angle, active_end)
        cairo_set_line_width(cr, pt.thickness + 18 + 6 * breath)
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.06 + 0.04 * breath))
        cairo_stroke(cr)
        -- Medium bloom
        cairo_arc(cr, pt.x, pt.y, pt.radius, start_angle, active_end)
        cairo_set_line_width(cr, pt.thickness + 10 + 3 * breath)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.10 + 0.06 * breath))
        cairo_stroke(cr)
    end

    -- Gauge face fill (breathing)
    cairo_arc(cr, pt.x, pt.y, pt.radius - pt.thickness, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.03 + 0.03 * breath))
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

    -- Active segments with intense glow
    for i = 1, active_segments do
        local a1 = start_angle + (i - 1) * arc_length
        local a2 = a1 + arc_length - (gap * math.pi / 180)

        -- Bright glow layer
        cairo_arc(cr, pt.x, pt.y, pt.radius, a1, a2)
        cairo_set_line_width(cr, pt.thickness + 6 + 3 * breath)
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.15 + 0.10 * breath))
        cairo_stroke(cr)

        -- Main segment
        cairo_arc(cr, pt.x, pt.y, pt.radius, a1, a2)
        cairo_set_line_width(cr, pt.thickness)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, pt.fg_alpha))
        cairo_stroke(cr)
    end

    -- Pulsing alarm when > 80%
    if pct > 80 then
        local pulse = 0.5 + 0.5 * math.sin(time * 5)
        local active_end = start_angle + value * (end_angle - start_angle)
        cairo_arc(cr, pt.x, pt.y, pt.radius, start_angle, active_end)
        cairo_set_line_width(cr, pt.thickness + 16 + 6 * pulse)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(0xff0033, 0.10 + 0.10 * pulse))
        cairo_stroke(cr)
    end

    -- === SPINNING DECORATIVE RINGS ===
    -- Inner ring spins clockwise
    local inner_r = pt.radius - pt.thickness - 4
    local spin1 = time * 0.8 + ring_index * 0.5
    local inner_arc = math.pi * 0.6
    for k = 0, 2 do
        local sa = spin1 + k * (2 * math.pi / 3)
        cairo_arc(cr, pt.x, pt.y, inner_r, sa, sa + inner_arc)
        cairo_set_line_width(cr, 1.5)
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(accents[1], 0.20 + 0.12 * breath))
        cairo_stroke(cr)
    end

    -- Outer ring spins counter-clockwise
    local outer_r = pt.radius + pt.thickness + 4
    local spin2 = -time * 0.6 + ring_index * 0.3
    local outer_arc = math.pi * 0.4
    for k = 0, 3 do
        local sa = spin2 + k * (2 * math.pi / 4)
        cairo_arc(cr, pt.x, pt.y, outer_r, sa, sa + outer_arc)
        cairo_set_line_width(cr, 1)
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(accents[2], 0.15 + 0.10 * breath))
        cairo_stroke(cr)
    end

    -- === MULTI-ORBIT PARTICLES (3 per ring) ===
    local arc_range = end_angle - start_angle
    local orbit_configs = {
        {radius = pt.radius + pt.thickness + 9,  speed = 1.8, phase = 0,    color = accents[1], size = 3.0},
        {radius = pt.radius + pt.thickness + 14, speed = 1.2, phase = 2.1,  color = accents[2], size = 2.5},
        {radius = pt.radius - pt.thickness - 8,  speed = 2.5, phase = 4.2,  color = accents[3], size = 2.0},
    }

    for _, orb in ipairs(orbit_configs) do
        local orbit_pos = ((time * orb.speed + ring_index * 1.1 + orb.phase) % arc_range) + start_angle
        local ox = pt.x + orb.radius * math.cos(orbit_pos)
        local oy = pt.y + orb.radius * math.sin(orbit_pos)

        -- Trail (6 segments, fading and shrinking)
        for t = 1, 6 do
            local trail_angle = orbit_pos - t * 0.12
            local tx = pt.x + orb.radius * math.cos(trail_angle)
            local ty = pt.y + orb.radius * math.sin(trail_angle)
            local trail_alpha = (0.30 - t * 0.045)
            local trail_size = orb.size - t * 0.3
            if trail_size > 0 and trail_alpha > 0 then
                cairo_arc(cr, tx, ty, trail_size, 0, 2 * math.pi)
                cairo_set_source_rgba(cr, rgb_to_r_g_b(orb.color, trail_alpha))
                cairo_fill(cr)
            end
        end

        -- Particle outer glow
        cairo_arc(cr, ox, oy, orb.size + 3, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(orb.color, 0.25))
        cairo_fill(cr)

        -- Particle mid glow
        cairo_arc(cr, ox, oy, orb.size + 1, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(orb.color, 0.5))
        cairo_fill(cr)

        -- Particle core
        cairo_arc(cr, ox, oy, orb.size * 0.6, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(WHITE, 0.9))
        cairo_fill(cr)
    end

    -- === PULSATING INDICATOR DOT at end of active arc ===
    if active_segments > 0 then
        local active_end = start_angle + value * (end_angle - start_angle)
        local dx = pt.x + pt.radius * math.cos(active_end)
        local dy = pt.y + pt.radius * math.sin(active_end)
        local pulse = 0.5 + 0.5 * math.sin(time * 4 + ring_index * 0.8)

        -- Wide glow
        cairo_arc(cr, dx, dy, 5 + pulse * 4, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(fg_color, 0.20 * pulse))
        cairo_fill(cr)

        -- Bright core
        cairo_arc(cr, dx, dy, 3, 0, 2 * math.pi)
        cairo_set_source_rgba(cr, rgb_to_r_g_b(WHITE, 0.8 + 0.2 * pulse))
        cairo_fill(cr)
    end
end

-- Glowing line with energy pulse traveling along it
function draw_glow_line(cr, x1, y, x2, color, alpha, time)
    time = time or 0
    local breath = 0.5 + 0.5 * math.sin(time * 2.0)
    local line_len = x2 - x1

    -- Wide glow
    cairo_move_to(cr, x1, y)
    cairo_line_to(cr, x2, y)
    cairo_set_line_width(cr, 4 + 2 * breath)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * (0.20 + 0.15 * breath)))
    cairo_stroke(cr)

    -- Core line
    cairo_move_to(cr, x1, y)
    cairo_line_to(cr, x2, y)
    cairo_set_line_width(cr, 1)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * (0.6 + 0.3 * breath)))
    cairo_stroke(cr)

    -- Energy pulse traveling along the line
    local pulse_period = 4
    local pulse_pos = ((time % pulse_period) / pulse_period)
    local px = x1 + pulse_pos * line_len
    local pulse_width = 40

    local gradient = cairo_pattern_create_linear(px - pulse_width, y, px + pulse_width, y)
    cairo_pattern_add_color_stop_rgba(gradient, 0, rgb_to_r_g_b(color, 0))
    cairo_pattern_add_color_stop_rgba(gradient, 0.5, rgb_to_r_g_b(color, 0.5))
    cairo_pattern_add_color_stop_rgba(gradient, 1, rgb_to_r_g_b(color, 0))
    cairo_rectangle(cr, px - pulse_width, y - 3, pulse_width * 2, 6)
    cairo_set_source(cr, gradient)
    cairo_fill(cr)
    cairo_pattern_destroy(gradient)

    -- Bright dot at pulse center
    cairo_arc(cr, px, y, 2.5, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(WHITE, 0.7))
    cairo_fill(cr)
end

function draw_corner_bracket(cr, x, y, size, color, alpha, flip_x, flip_y, time)
    time = time or 0
    local breath = 0.5 + 0.5 * math.sin(time * 2.5)
    local dx = flip_x and -size or size
    local dy = flip_y and -size or size

    -- Bracket glow
    cairo_move_to(cr, x + dx, y)
    cairo_line_to(cr, x, y)
    cairo_line_to(cr, x, y + dy)
    cairo_set_line_width(cr, 4 + 2 * breath)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * (0.2 + 0.2 * breath)))
    cairo_stroke(cr)

    -- Bracket core
    cairo_move_to(cr, x + dx, y)
    cairo_line_to(cr, x, y)
    cairo_line_to(cr, x, y + dy)
    cairo_set_line_width(cr, 2)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, alpha * (0.8 + 0.2 * breath)))
    cairo_stroke(cr)

    -- Bright corner glow dot
    cairo_arc(cr, x, y, 3 + 2 * breath, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, 0.3 + 0.3 * breath))
    cairo_fill(cr)

    -- Corner dot core
    cairo_arc(cr, x, y, 1.5, 0, 2 * math.pi)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(WHITE, 0.6 + 0.3 * breath))
    cairo_fill(cr)
end

-- Dual scan lines: cyan left-to-right, magenta right-to-left
function draw_scan_lines(cr, time, width, height)
    -- Cyan sweep (left to right)
    local period1 = 6
    local scan_x1 = ((time % period1) / period1) * (width + 300) - 150
    local g1 = cairo_pattern_create_linear(scan_x1 - 120, 0, scan_x1 + 120, 0)
    cairo_pattern_add_color_stop_rgba(g1, 0, 0, 0.94, 1, 0)
    cairo_pattern_add_color_stop_rgba(g1, 0.5, 0, 0.94, 1, 0.07)
    cairo_pattern_add_color_stop_rgba(g1, 1, 0, 0.94, 1, 0)
    cairo_rectangle(cr, scan_x1 - 120, 0, 240, height)
    cairo_set_source(cr, g1)
    cairo_fill(cr)
    cairo_pattern_destroy(g1)

    -- Magenta sweep (right to left)
    local period2 = 9
    local scan_x2 = width - ((time % period2) / period2) * (width + 300) + 150
    local g2 = cairo_pattern_create_linear(scan_x2 - 80, 0, scan_x2 + 80, 0)
    cairo_pattern_add_color_stop_rgba(g2, 0, 1, 0, 1, 0)
    cairo_pattern_add_color_stop_rgba(g2, 0.5, 1, 0, 1, 0.04)
    cairo_pattern_add_color_stop_rgba(g2, 1, 1, 0, 1, 0)
    cairo_rectangle(cr, scan_x2 - 80, 0, 160, height)
    cairo_set_source(cr, g2)
    cairo_fill(cr)
    cairo_pattern_destroy(g2)
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

    -- Dual animated scan line sweeps
    draw_scan_lines(cr, time, w, h)

    -- Corner bracket decorations (with intense breathing glow)
    local s = 25
    local rx = w - 15
    local by = 790
    draw_corner_bracket(cr, 15, 15, s, CYAN, 0.6, false, false, time)
    draw_corner_bracket(cr, rx, 15, s, CYAN, 0.6, true, false, time + 0.5)
    draw_corner_bracket(cr, 15, by, s, CYAN, 0.6, false, true, time + 1.0)
    draw_corner_bracket(cr, rx, by, s, CYAN, 0.6, true, true, time + 1.5)

    -- Horizontal divider lines with energy pulses
    draw_glow_line(cr, 30, 140, rx - 15, CYAN, 0.5, time)
    draw_glow_line(cr, 30, 295, rx - 15, MAGENTA, 0.4, time + 1.3)
    draw_glow_line(cr, 30, by, rx - 15, CYAN, 0.5, time + 2.6)

    -- Vertical divider with breathing glow
    local vbreath = 0.5 + 0.5 * math.sin(time * 2.0)
    -- Glow
    cairo_move_to(cr, 650, 310)
    cairo_line_to(cr, 650, h - 40)
    cairo_set_line_width(cr, 3 + vbreath)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(CYAN, 0.06 + 0.04 * vbreath))
    cairo_stroke(cr)
    -- Core
    cairo_move_to(cr, 650, 310)
    cairo_line_to(cr, 650, h - 40)
    cairo_set_line_width(cr, 1)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(CYAN, 0.15 + 0.10 * vbreath))
    cairo_stroke(cr)

    -- Vertical energy pulse (travels downward)
    local vpulse_period = 5
    local vpulse_y = 310 + (((time + 0.7) % vpulse_period) / vpulse_period) * (h - 40 - 310)
    local vg = cairo_pattern_create_linear(650, vpulse_y - 25, 650, vpulse_y + 25)
    cairo_pattern_add_color_stop_rgba(vg, 0, rgb_to_r_g_b(CYAN, 0))
    cairo_pattern_add_color_stop_rgba(vg, 0.5, rgb_to_r_g_b(CYAN, 0.4))
    cairo_pattern_add_color_stop_rgba(vg, 1, rgb_to_r_g_b(CYAN, 0))
    cairo_rectangle(cr, 647, vpulse_y - 25, 6, 50)
    cairo_set_source(cr, vg)
    cairo_fill(cr)
    cairo_pattern_destroy(vg)

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

            -- Value text (with glow)
            draw_centered_text(cr, tostring(math.floor(value)), pt.x, pt.y - 8, 16, pt.fg_colour, 1)

            -- Unit text
            draw_centered_text(cr, pt.unit, pt.x, pt.y + 14, 9, WHITE, 0.5, CAIRO_FONT_WEIGHT_NORMAL)

            -- Label above ring
            draw_centered_text(cr, pt.label, pt.x, pt.y - pt.radius - 18, 11, WHITE, 0.8)
        end
    end

    cairo_destroy(cr)
    cairo_surface_destroy(cs)
end
