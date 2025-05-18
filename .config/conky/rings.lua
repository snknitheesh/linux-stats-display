settings_table = {
    -- CPU Usage
    {
        name='cpu',
        arg='cpu0',
        label='CPU Usage',
        max=100,
        bg_colour=0x444444,
        bg_alpha=0.2,
        fg_colour=0x00ff00,
        fg_alpha=0.8,
        x=100, y=215,
        radius=60,
        thickness=10,
        start_angle = 135,
        end_angle = 405,
    },
    -- CPU Temp
    {
        name='execi',
        arg='5 sensors | grep "Tctl:" | awk \'{print $2}\' | cut -c 2-3',
        label='CPU Temp',
        max=100,
        bg_colour=0x444444,
        bg_alpha=0.2,
        fg_colour=0xff5555,
        fg_alpha=0.8,
        x=610, y=215,
        radius=60,
        thickness=10,
        start_angle = 135,
        end_angle = 405,
    },
    -- RAM Usage
    {
        name='memperc',
        arg='',
        label='RAM Usage',
        max=100,
        bg_colour=0x444444,
        bg_alpha=0.2,
        fg_colour=0x00ffff,
        fg_alpha=0.8,
        x=270, y=215,
        radius=60,
        thickness=10,
        start_angle = 135,
        end_angle = 405,
    },
    -- GPU Usage
    {
        name='execi',
        arg='5 nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits',
        label='GPU Usage',
        max=100,
        bg_colour=0x444444,
        bg_alpha=0.2,
        fg_colour=0xff9900,
        fg_alpha=0.8,
        x=440, y=215,
        radius=60,
        thickness=10,
        start_angle = 135,
        end_angle = 405,
    },
    -- GPU Temp
    {
        name='execi',
        arg='5 nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits',
        label='GPU Temp',
        max=100,
        bg_colour=0x444444,
        bg_alpha=0.2,
        fg_colour=0xff5555,
        fg_alpha=0.8,
        x=780, y=215,
        radius=60,
        thickness=10,
        start_angle = 135,
        end_angle = 405,
    },
    --GPU Power
    {
        name='execi',
        arg='5 nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits | cut -d "." -f1',
        label='GPU Power',
        max=600, 
        bg_colour=0x444444,
        bg_alpha=0.2,
        fg_colour=0xffaa00,
        fg_alpha=0.8,
        x=950, y=215,
        radius=60,
        thickness=10,
        start_angle=135,
        end_angle=405,
    },
    --CPU Power
    {
        name='execi',
        arg='5 sensors | grep "PPT:" | awk \'{print $2}\' | cut -d "." -f1',
        label='CPU Power',
        max=300,  
        bg_colour=0x444444,
        bg_alpha=0.2,
        fg_colour=0xff5555,
        fg_alpha=0.8,
        x=1120, y=215,
        radius=60,
        thickness=10,
        start_angle=135,
        end_angle=405,
    }

}

require 'cairo'

function rgb_to_r_g_b(colour, alpha)
    return ((colour / 0x10000) % 0x100) / 255.0,
           ((colour / 0x100) % 0x100) / 255.0,
           (colour % 0x100) / 255.0, alpha
end

function get_color_by_value(value)
    if value < 50 then
        return 0x00ff00  
    elseif value < 80 then
        return 0xffa500  
    else
        return 0xff0000  
    end
end

function draw_segmented_ring(cr, value, pt)
    local segments = 30
    local gap = 2 
    local start_angle = pt['start_angle'] * math.pi / 180
    local end_angle = pt['end_angle'] * math.pi / 180
    local arc_length = (end_angle - start_angle) / segments
    local active_segments = math.floor(value * segments + 0.5)
    for i = 1, segments do
        local angle1 = start_angle + (i - 1) * arc_length
        local angle2 = angle1 + arc_length - (gap * math.pi / 180)

        cairo_arc(cr, pt['x'], pt['y'], pt['radius'], angle1, angle2)
        cairo_set_line_width(cr, pt['thickness'])

        if i <= active_segments then
            cairo_set_source_rgba(cr, rgb_to_r_g_b(pt['fg_colour'], pt['fg_alpha']))
        else
            cairo_set_source_rgba(cr, rgb_to_r_g_b(pt['bg_colour'], pt['bg_alpha']))
        end
        cairo_stroke(cr)
    end
end

function draw_text(cr, text, x, y, font_size, color)
    cairo_select_font_face(cr, "DejaVu Sans", CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_BOLD)
    cairo_set_font_size(cr, font_size)
    cairo_set_source_rgba(cr, rgb_to_r_g_b(color, 1))
    cairo_move_to(cr, x, y)
    cairo_show_text(cr, text)
    cairo_stroke(cr)
end

function conky_draw_ring_stats()
    if conky_window == nil then return end
    local cs = cairo_xlib_surface_create(conky_window.display, conky_window.drawable,
        conky_window.visual, conky_window.width, conky_window.height)
    local cr = cairo_create(cs)

    for i, pt in ipairs(settings_table) do
        local value
        if pt['arg'] == '' then
            value = tonumber(conky_parse('${' .. pt['name'] .. '}'))
        else
            value = tonumber(conky_parse('${' .. pt['name'] .. ' ' .. pt['arg'] .. '}'))
        end

        if value ~= nil then
            pt.fg_colour = get_color_by_value(value)
            draw_segmented_ring(cr, value / pt['max'], pt)

            draw_text(cr, pt['label'], pt['x'] - 40, pt['y'] - pt['radius'] - 20, 14, 0xffffff)
        end
    end
end
