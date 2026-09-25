let subnetMap = {};
let subnetNotes = {};
let maxNetSize = 0;
let infoColumnCount = 4
const tableColumnWidths = new Map()
let tableColumns = []
let tableWidthReference = 0
const defaultBlockColors = { split: '#f27f64', join: '#6fb0d6' }
let blockColors = { ...defaultBlockColors }
let colorLegend = new Map()
let inactiveColorMeanings = new Map()
const colorUndo = []
let paintStroke = null
let quickColorCell = null
const infoCellKeys = ['row_address', 'row_range', 'row_usable', 'row_hosts']

function validColor(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) }

function recordColor(color) {
    if (!validColor(color)) return
    const key = color.toLowerCase()
    if (colorLegend.has(key)) return
    const meaning = inactiveColorMeanings.get(key) || ''
    colorLegend.set(key, meaning)
    // The legend sits above the table: defer new rows until a paint stroke ends
    // so revealing it cannot move cells away from the pointer mid-drag.
    if (!paintStroke) appendColorLegendRow(key, meaning)
}

function appendColorLegendRow(color, meaning) {
    const row = document.createElement('tr')
    row.dataset.color = color
    const swatchCell = document.createElement('td')
    const swatch = document.createElement('span')
    swatch.className = 'legend-swatch'
    swatch.style.backgroundColor = color
    swatch.setAttribute('aria-hidden', 'true')
    const code = document.createElement('code')
    code.textContent = color.toUpperCase()
    swatchCell.append(swatch, code)
    const meaningCell = document.createElement('td')
    const editor = document.createElement('textarea')
    editor.className = 'form-control form-control-sm'
    editor.rows = 1
    editor.placeholder = 'e.g. Production, DMZ, Reserved'
    editor.setAttribute('aria-label', 'Meaning for ' + color.toUpperCase())
    editor.value = meaning
    editor.addEventListener('input', () => colorLegend.set(color, editor.value))
    meaningCell.appendChild(editor)
    row.append(swatchCell, meaningCell)
    document.getElementById('color_legend_rows').appendChild(row)
    document.getElementById('color_legend').hidden = false
}

function collectDesignColors() {
    // Keep only effective colors of currently rendered cells, not hidden parent
    // metadata, overridden row colors or a Join default with no Join cells.
    if (paintStroke) return
    const used = new Set()
    document.querySelectorAll('#calcbody td').forEach(cell => {
        const node = getSubnetNode(cell.dataset.subnet)
        if (!node) return
        const key = infoCellKeys.find(key => cell.classList.contains(key))
        const override = node._cellColors?.[key || 'block']
        let color = validColor(override) ? override : key ? node._color : null
        if (!key && !validColor(override)) {
            const kind = cell.classList.contains('split') ? 'split' : 'join'
            if (blockColors[kind].toLowerCase() !== defaultBlockColors[kind]) color = blockColors[kind]
        }
        if (validColor(color)) used.add(color.toLowerCase())
    })
    for (const [color, meaning] of colorLegend) {
        if (!used.has(color)) {
            inactiveColorMeanings.set(color, meaning)
            colorLegend.delete(color)
        }
    }
    document.querySelectorAll('#color_legend_rows tr').forEach(row => {
        if (!used.has(row.dataset.color)) row.remove()
    })
    used.forEach(recordColor)
    document.getElementById('color_legend').hidden = colorLegend.size === 0
}

function textColor(background) {
    const rgb = background.slice(1).match(/../g).map(value => {
        const channel = parseInt(value, 16) / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#000000' : '#ffffff'
}

function refreshColors() {
    for (const kind of ['split', 'join']) {
        document.documentElement.style.setProperty('--' + kind + '-background', blockColors[kind])
        document.documentElement.style.setProperty('--' + kind + '-foreground', textColor(blockColors[kind]))
        document.getElementById(kind + '_color').value = blockColors[kind]
    }
    document.querySelectorAll('#calcbody tr').forEach(row => {
        const node = getSubnetNode(row.querySelector('.row_address').dataset.subnet)
        row.style.backgroundColor = validColor(node._color) ? node._color : ''
        for (const cell of row.cells) {
            const key = infoCellKeys.find(key => cell.classList.contains(key))
            const cellNode = key ? node : getSubnetNode(cell.dataset.subnet)
            const override = cellNode?._cellColors?.[key || 'block']
            cell.style.backgroundColor = validColor(override) ? override : ''
            const background = validColor(override) ? override : key ? (validColor(node._color) ? node._color : '#ffffff') : blockColors[cell.classList.contains('split') ? 'split' : 'join']
            cell.style.color = textColor(background)
        }
    })
    collectDesignColors()
}

function rememberColorChange(changes) {
    if (!changes.length) return
    colorUndo.push(changes)
    if (colorUndo.length > 50) colorUndo.shift()
    $('#undo_color').prop('disabled', false)
}

function applyPaint(cell, color, scope, changes) {
    const key = infoCellKeys.find(key => cell.classList.contains(key))
    const cidr = cell.dataset.subnet
    const node = getSubnetNode(cidr)
    const property = key && scope === 'row' ? '_color' : '_cellColors'
    const before = JSON.stringify(node[property])
    if (property === '_color') {
        if (color) node._color = color
        else delete node._color
    } else {
        const colors = { ...node._cellColors }
        if (color) colors[key || 'block'] = color
        else delete colors[key || 'block']
        if (Object.keys(colors).length) node._cellColors = colors
        else delete node._cellColors
    }
    if (JSON.stringify(node[property]) !== before) changes.push(() => {
        const target = getSubnetNode(cidr)
        if (!target) return
        if (before === undefined) delete target[property]
        else target[property] = JSON.parse(before)
    })
    refreshColors()
}

function selectPaintColor(color) {
    inflightColor = color
    $('#color_hint').text('Selected ' + (color ? color.toUpperCase() : 'reset') + ' — click or drag across cells. Esc stops painting.')
    $('#calc').addClass('color-mode')
}

function closeQuickColors() {
    $('#calc .quick-color-target').removeClass('quick-color-target')
    document.getElementById('quick_colors').hidden = true
    quickColorCell = null
}
// NORMAL mode:
//   - Smallest subnet: /32
//   - Two reserved addresses per subnet of size <= 30:
//     - Net+0 = Network Address
//     - Last = Broadcast Address
// AWS mode:
//   - Smallest subnet: /28
//   - Two reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = AWS Reserved - VPC Router
//     - Net+2 = AWS Reserved - VPC DNS
//     - Net+3 = AWS Reserved - Future Use
//     - Last = Broadcast Address
// Azure mode:
//   - Smallest subnet: /29
//   - Two reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = Reserved - Default Gateway
//     - Net+2 = Reserved - DNS Mapping
//     - Net+3 = Reserved - DNS Mapping
//     - Last = Broadcast Address
// OCI mode:
//   - Smallest subnet: /30
//   - Three reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = OCI Reserved - Default Gateway Address
//     - Last = Broadcast Address
// Huawei Cloud: first two and last three IPs reserved; smallest subnet /28.
let operatingMode = 'Standard'
let previousOperatingMode = 'Standard'
let inflightColor = 'NONE'
let urlVersion = '1'
let configVersion = '2'

const netsizePatterns = {
    Standard: '^([12]?[0-9]|3[0-2])$',
    AZURE: '^([12]?[0-9])$',
    AWS: '^(1?[0-9]|2[0-8])$',
    OCI: '^([12]?[0-9]|30)$',
    HUAWEI: '^(1?[0-9]|2[0-8])$',
};

const minSubnetSizes = {
    Standard: 32,
    AZURE: 29,
    AWS: 28,
    OCI: 30,
    HUAWEI: 28,
};

const huaweiSubnetDocs = 'https://support.huaweicloud.com/intl/en-us/usermanual-vpc/en-us_topic_0013748726.html'

$('input#network').on('paste', function (e) {
    let pastedData = window.event.clipboardData.getData('text')
    if (pastedData.includes('/')) {
        let [network, netSize] = pastedData.split('/')
        $('#network').val(network)
        $('#netsize').val(netSize)
    }
    e.preventDefault()
});

$("input#network").on('keydown', function (e) {
    if (e.key === '/') {
        e.preventDefault()
        $('input#netsize').focus().select()
    }
});

$('input#network,input#netsize').on('input', function() {
    $('#input_form')[0].classList.add('was-validated');
})

const extraColors = ['#f8bbd0', '#e1bee7', '#d1c4e9', '#c5cae9', '#bbdefb', '#b3e5fc', '#b2ebf2', '#b2dfdb', '#c8e6c9', '#dcedc8', '#fff9c4', '#ffecb3', '#ffe0b2', '#d7ccc8']
extraColors.forEach((color, index) => {
    $('<button>', { type: 'button', id: 'palette_picker_' + (index + 11), 'aria-label': 'Color ' + (index + 11), title: color })
        .css('background-color', color).insertBefore('#color_palette .custom-color-label')
})
$('#color_palette div[role="button"]').attr('tabindex', '0')
$('#color_palette').on('keydown', 'div[role="button"]', function(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.click()
    }
})
$('#color_palette').on('click', '[id^="palette_picker_"]', function() {
    // We don't really NEED to convert this to hex, but it's really low overhead to do the
    // conversion here and saves us space in the export/save
    selectPaintColor(rgba2hex($(this).css('background-color')))
    $('#color_palette [id^="palette_picker_"]').attr('aria-pressed', 'false')
    $(this).attr('aria-pressed', 'true')
})
$('#custom_color').on('input change', function() {
    selectPaintColor(this.value)
    $('#color_palette [id^="palette_picker_"]').attr('aria-pressed', 'false')
})

$('#calcbody').on('pointerdown', 'td', function(event) {
    if (event.button !== 0 || inflightColor === 'NONE' || $(event.target).closest('button, input, label, .column-resizer').length) return
    event.preventDefault()
    paintStroke = { changes: [], visited: new Set(), color: inflightColor, scope: $('#paint_scope').val() }
    document.body.classList.add('painting-cells')
    paintCellInStroke(this)
})

function paintCellInStroke(cell) {
    if (!paintStroke || paintStroke.visited.has(cell)) return
    paintStroke.visited.add(cell)
    applyPaint(cell, paintStroke.color, paintStroke.scope, paintStroke.changes)
}

document.addEventListener('pointermove', event => {
    if (!paintStroke) return
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('#calcbody td')
    if (cell) paintCellInStroke(cell)
})
function finishPaintStroke() {
    if (paintStroke) rememberColorChange(paintStroke.changes)
    paintStroke = null
    document.body.classList.remove('painting-cells')
    collectDesignColors()
}
document.addEventListener('pointerup', finishPaintStroke)
document.addEventListener('pointercancel', finishPaintStroke)
window.addEventListener('blur', finishPaintStroke)
$('#undo_color').on('click', function() {
    const changes = colorUndo.pop()
    if (changes) [...changes].reverse().forEach(undo => undo())
    refreshColors()
    $(this).prop('disabled', !colorUndo.length)
})
$('#clear_color').on('click', function() {
    $('#color_palette [id^="palette_picker_"]').attr('aria-pressed', 'false')
    selectPaintColor('')
})
let previousBlockColor
$('#split_color, #join_color').on('input', function() {
    if (!previousBlockColor) previousBlockColor = { ...blockColors }
    const kind = this.id === 'split_color' ? 'split' : 'join'
    blockColors[kind] = this.value
    refreshColors()
})
$('#split_color, #join_color').on('change', function() {
    // Record the committed choice, not every intermediate native-picker shade.
    collectDesignColors()
    const previous = previousBlockColor
    if (previous && JSON.stringify(previous) !== JSON.stringify(blockColors)) rememberColorChange([() => { blockColors = previous }])
    previousBlockColor = null
})
$('#reset_tree_colors').on('click', function() {
    const previous = { ...blockColors }
    rememberColorChange([() => { blockColors = previous }])
    blockColors = { ...defaultBlockColors }
    refreshColors()
})

$('#color_palette [id^="palette_picker_"]').each(function(index) {
    const color = rgba2hex(getComputedStyle(this).backgroundColor)
    $('<button>', { type: 'button', 'aria-label': 'Quick color ' + (index + 1), title: color })
        .css('background-color', color).on('click', () => {
            const changes = []
            applyPaint(quickColorCell, color, 'cell', changes)
            rememberColorChange(changes)
            closeQuickColors()
        }).appendTo('#quick_swatches')
})
$('#calcbody').on('contextmenu', 'td', function(event) {
    event.preventDefault()
    closeQuickColors()
    quickColorCell = this
    this.classList.add('quick-color-target')
    const panel = document.getElementById('quick_colors')
    panel.hidden = false
    panel.style.left = Math.max(8, Math.min(event.clientX, innerWidth - panel.offsetWidth - 8)) + 'px'
    panel.style.top = Math.max(8, Math.min(event.clientY, innerHeight - panel.offsetHeight - 8)) + 'px'
    const background = this.style.backgroundColor || (this.matches('.split, .join') ? getComputedStyle(this).backgroundColor : getComputedStyle(this.parentElement).backgroundColor)
    $('#quick_custom_color').val(rgba2hex(background).slice(0, 7))
    panel.querySelector('button').focus({ preventScroll: true })
})
$('#quick_custom_color').on('change', function() {
    if (!quickColorCell) return
    const changes = []
    applyPaint(quickColorCell, this.value, 'cell', changes)
    rememberColorChange(changes)
    closeQuickColors()
})
$('#clear_cell_color').on('click', function() {
    const changes = []
    applyPaint(quickColorCell, '', 'cell', changes)
    rememberColorChange(changes)
    closeQuickColors()
})
$('#close_quick_colors').on('click', closeQuickColors)
document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#quick_colors')) closeQuickColors()
})
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        finishPaintStroke()
        closeQuickColors()
        setColorPanel(false)
    }
})

$('#btn_go').on('click', function() {
    $('#input_form').removeClass('was-validated');
    $('#input_form').validate();
    if ($('#input_form').valid()) {
        $('#input_form')[0].classList.add('was-validated');
        reset();
        // Additional actions upon validation can be added here
    } else {
        show_warning_modal('<div>Please correct the errors in the form!</div>');
    }

})

$('#dropdown_standard').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'Standard';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }

});

$('#dropdown_azure').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'AZURE';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }

});

$('#dropdown_aws').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'AWS';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#dropdown_oci').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'OCI';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#importBtn').on('click', function() {
    importConfig(JSON.parse($('#importExportArea').val()))
})

$('#dropdown_huawei').on('click', function(event) {
    event.preventDefault()
    previousOperatingMode = operatingMode
    operatingMode = 'HUAWEI'
    if (!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode
    }
})

function generateSaveFilename(baseNetworkCidr) {
    return baseNetworkCidr.replace('/', '_') + '.json'
}

function downloadJSONFile(jsonString, filename) {
    const blob = new Blob([jsonString], { type: 'application/json' })
    const objectURL = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectURL
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(objectURL)
}

$('#saveBtn').on('click', function() {
    try {
        const config = exportConfig(false)
        const jsonString = JSON.stringify(config, null, 2)
        const filename = generateSaveFilename(config.base_network)
        downloadJSONFile(jsonString, filename)
    } catch (e) {
        show_warning_modal('<div>The file download was blocked by your browser. Please check your browser\'s download settings, or copy the JSON from the text area above and save it manually.</div>')
    }
})

$('#btn_export_excel').on('click', function(event) {
    event.preventDefault()
    try {
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, buildExcelSubnetSheet(), 'Subnets')
        XLSX.utils.book_append_sheet(workbook, buildExcelNotesSheet(), 'Hierarchy Notes')
        const filename = Object.keys(subnetMap)[0].replace('/', '_') + '.xlsx'
        XLSX.writeFile(workbook, filename)
    } catch (e) {
        show_warning_modal('<div>Unable to export the Excel file. Please reload the page and try again, and check your connection and browser download settings.</div>')
    }
})

function excelCell(value, background = 'FFFFFF', bold = false) {
    const edge = { style: 'thin', color: { rgb: 'D0D7DE' } }
    return {
        t: typeof value === 'number' ? 'n' : 's', v: value,
        s: {
            fill: { patternType: 'solid', fgColor: { rgb: background } },
            font: { name: 'Calibri', sz: 11, bold },
            alignment: { vertical: 'center', wrapText: true },
            border: { top: edge, bottom: edge, left: edge, right: edge }
        }
    }
}

function excelBackground(element) {
    const color = getComputedStyle(element).backgroundColor
    if (color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return 'FFFFFF'
    return rgba2hex(color).slice(1, 7).toUpperCase()
}

function buildExcelSubnetSheet() {
    const sheet = { '!merges': [], '!rows': [{ hpt: 30 }] }
    const headers = ['Subnet Address', 'Range of Addresses', $('#useableHeader').text(), 'Hosts']
    headers.forEach((value, c) => { sheet[XLSX.utils.encode_cell({ r: 0, c })] = excelCell(value, 'E9ECEF', true) })
    const treeStartColumn = headers.length
    let lastColumn = treeStartColumn
    // Keep one Excel column per tree level, matching the HTML table columns.
    // Covered cells are also styled so merged ranges keep their complete fill/border.
    document.querySelectorAll('#calcbody tr').forEach((row, index) => {
        const r = index + 1
        let c = 0
        sheet['!rows'][r] = { hpt: 45 }
        for (const cell of row.cells) {
            while (sheet[XLSX.utils.encode_cell({ r, c })]) c++
            const treeCell = cell.matches('.split, .join')
            const columnSpan = cell.colSpan
            let value = cell.textContent.trim()
            if (cell.matches('.row_hosts')) value = Number(value)
            if (treeCell) {
                const node = getSubnetNode(cell.dataset.subnet)
                value = '/' + cell.dataset.subnet.split('/')[1]
                if (node && node._note) value += '\n' + node._note
            }
            const background = excelBackground(treeCell || cell.style.backgroundColor ? cell : row)
            for (let dr = 0; dr < cell.rowSpan; dr++) {
                for (let dc = 0; dc < columnSpan; dc++) {
                    const exported = excelCell(dr || dc ? '' : value, background)
                    exported.s.font.color = { rgb: textColor('#' + background).slice(1) }
                    sheet[XLSX.utils.encode_cell({ r: r + dr, c: c + dc })] = exported
                }
            }
            if (cell.rowSpan > 1 || columnSpan > 1) {
                sheet['!merges'].push({ s: { r, c }, e: { r: r + cell.rowSpan - 1, c: c + columnSpan - 1 } })
            }
            c += columnSpan
            lastColumn = Math.max(lastColumn, c - 1)
        }
    })
    for (let c = treeStartColumn; c <= lastColumn; c++) {
        sheet[XLSX.utils.encode_cell({ r: 0, c })] = excelCell('', 'E9ECEF', true)
    }
    if (lastColumn > treeStartColumn) sheet['!merges'].push({ s: { r: 0, c: treeStartColumn }, e: { r: 0, c: lastColumn } })
    sheet['!cols'] = [{ wch: 20 }, { wch: 38 }, { wch: 38 }, { wch: 12 }]
        .concat(Array.from({ length: lastColumn - treeStartColumn + 1 }, () => ({ wch: 12 })))
    sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: document.querySelectorAll('#calcbody tr').length, c: lastColumn } })
    appendExcelColorLegend(sheet, lastColumn)
    return sheet
}

function appendExcelColorLegend(sheet, lastColumn) {
    if (!colorLegend.size) return
    const startRow = XLSX.utils.decode_range(sheet['!ref']).e.r + 2
    const rows = [['Color', 'Meaning / purpose'], ...Array.from(colorLegend, ([color, meaning]) => [color.toUpperCase(), meaning])]
    rows.forEach((row, index) => {
        const r = startRow + index
        for (let c = 0; c <= lastColumn; c++) {
            const fill = index === 0 ? 'E9ECEF' : c === 0 ? row[0].slice(1) : 'FFFFFF'
            const cell = excelCell(c < 2 ? row[c] : '', fill, index === 0)
            cell.s.font.color = { rgb: textColor('#' + fill).slice(1) }
            sheet[XLSX.utils.encode_cell({ r, c })] = cell
        }
        sheet['!merges'].push({ s: { r, c: 1 }, e: { r, c: lastColumn } })
        const lines = row[1].split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 80)), 0)
        sheet['!rows'][r] = { hpt: Math.max(30, lines * 16 + 10) }
    })
    sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: startRow + rows.length - 1, c: lastColumn } })
}

function buildExcelNotesSheet() {
    const rows = [['Level', 'Subnet Address', 'Parent Subnet', 'Note']]
    function visit(tree, parent = '', depth = 0) {
        for (const cidr of Object.keys(tree)) {
            if (cidr.startsWith('_')) continue
            rows.push([depth, cidr, parent, tree[cidr]._note || ''])
            visit(tree[cidr], cidr, depth + 1)
        }
    }
    visit(sortIPCIDRs(subnetMap))
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    rows.forEach((row, r) => row.forEach((value, c) => {
        sheet[XLSX.utils.encode_cell({ r, c })] = excelCell(value, r ? 'FFFFFF' : 'E9ECEF', r === 0)
    }))
    sheet['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 60 }]
    return sheet
}

$('#colors_word_open').on('click', function() {
    setColorPanel(document.getElementById('color_panel').hidden)
})

$('#colors_word_close').on('click', function() {
    setColorPanel(false)
    document.getElementById('colors_word_open').focus()
})

function setColorPanel(open) {
    document.getElementById('color_panel').hidden = !open
    $('#colors_word_open').attr('aria-expanded', String(open))
    if (!open) {
        finishPaintStroke()
        inflightColor = 'NONE'
        $('#calc').removeClass('color-mode')
        $('#color_palette [id^="palette_picker_"]').attr('aria-pressed', 'false')
        $('#color_hint').text('Pick a color, then click or drag across cells. Right-click a cell for quick colors.')
    }
}

let copyStatusTimer
$('#copy_url').on('click', async function() {
    clearTimeout(copyStatusTimer)
    const button = this
    const url = new URL(getConfigUrl(), window.location.href).href
    const input = document.getElementById('share_url')
    const fallback = document.getElementById('share_fallback')
    input.value = url
    fallback.hidden = true
    button.disabled = true
    $('#copy_url span').text('Copying…')
    $('#share_status').text('')
    let copied = false
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url)
            copied = true
        }
    } catch (error) {
        // Some browsers deny clipboard permission; offer a selectable link below.
    }
    if (!copied) {
        fallback.hidden = false
        input.focus()
        input.select()
        try {
            copied = document.execCommand('copy')
        } catch (error) {
            copied = false
        }
    }
    button.disabled = false
    if (copied) {
        fallback.hidden = true
        button.focus({ preventScroll: true })
        $('#copy_url span').text('Copied!')
        $('#share_status').text('Link copied — ready to share your current design.')
        copyStatusTimer = setTimeout(() => {
            $('#copy_url span').text('Copy Shareable URL')
            $('#share_status').text('')
        }, 3000)
    } else {
        $('#copy_url span').text('Copy Shareable URL')
        $('#share_status').text('Automatic copy is unavailable. Copy the selected link below with Ctrl+C or ⌘C.')
    }
})

$('#select_share_url').on('click', function() {
    const input = document.getElementById('share_url')
    input.focus()
    input.select()
})

$('#btn_import_export').on('click', function() {
    $('#importExportArea').val(JSON.stringify(exportConfig(false), null, 2))
})

function reset() {
    colorUndo.length = 0
    $('#undo_color').prop('disabled', true)

    set_usable_ips_title(operatingMode);

    let cidrInput = $('#network').val() + '/' + $('#netsize').val()
    let rootNetwork = get_network($('#network').val(), $('#netsize').val())
    let rootCidr = rootNetwork + '/' + $('#netsize').val()
    if (cidrInput !== rootCidr) {
        show_warning_modal('<div>Your network input is not on a network boundary for this network size. It has been automatically changed:</div><div class="font-monospace pt-2">' + escapeHtml($('#network').val()) + ' -> ' + escapeHtml(rootNetwork) + '</div>')
        $('#network').val(rootNetwork)
        cidrInput = $('#network').val() + '/' + $('#netsize').val()
    }
    if (Object.keys(subnetMap).length > 0) {
        // This page already has data imported, so lets see if we can just change the range
        if (isMatchingSize(Object.keys(subnetMap)[0], cidrInput)) {
            subnetMap = changeBaseNetwork(cidrInput)
        } else {
            // This is a page with existing data of a different subnet size, so make it blank
            // Could be an opportunity here to do the following:
            //   - Prompt the user to confirm they want to clear the existing data
            //   - Resize the existing data anyway by making the existing network a subnetwork of their new input (if it
            //     is a larger network), or by just trimming the network to the new size (if it is a smaller network),
            //     or even resizing all of the containing networks by change in size of the base network. For example a
            //     base network going from /16 -> /18 would be all containing networks would be resized smaller (/+2),
            //     or bigger (/-2) if going from /18 -> /16.
            subnetMap = {}
            subnetMap[rootCidr] = {}
        }
    } else {
        // This is a fresh page load with no existing data
        subnetMap[rootCidr] = {}
    }
    maxNetSize = parseInt($('#netsize').val())
    renderTable(operatingMode);
}

function changeBaseNetwork(newBaseNetwork) {
    // Minifiy it, to make all the keys in the subnetMap relative to their original base network
    // Then expand it, but with the new CIDR as the base network, effectively converting from old to new.
    let miniSubnetMap = {}
    minifySubnetMap(miniSubnetMap, subnetMap, Object.keys(subnetMap)[0])
    let newSubnetMap = {}
    expandSubnetMap(newSubnetMap, miniSubnetMap, newBaseNetwork)
    return newSubnetMap
}

function isMatchingSize(subnet1, subnet2) {
    return subnet1.split('/')[1] === subnet2.split('/')[1];
}

$('#calcbody').on('click', '.subnet-action', function(event) {
    colorUndo.length = 0
    $('#undo_color').prop('disabled', true)
    const cell = this.closest('td')
    // HTML DOM Data elements! Yay! See the `data-*` attributes of the HTML tags
    mutate_subnet_map(cell.dataset.mutateVerb, cell.dataset.subnet, '')
    renderTable(operatingMode);
})

$('#calcbody').on('input', 'input.block-note', updateNoteEditors)

$('#hierarchyNotesModal').on('show.bs.modal', function() {
    renderHierarchyNotes()
})

$('#hierarchy_notes_tree').on('input', 'input', updateNoteEditors)

function updateNoteEditors() {
    mutate_subnet_map('note', this.dataset.subnet, '', this.value)
    const subnet = this.dataset.subnet
    const value = this.value
    $('#calcbody input.block-note, #hierarchy_notes_tree input').each(function() {
        if (this.dataset.subnet === subnet) {
            this.value = value
            this.title = value || 'Click to add a note'
        }
    })
}

function subnetBlockEditor(cidr, verb, note) {
    // No placeholder wording: an edit icon hints that the block accepts text, and it fades
    // out once the block has content or receives focus.
    return '<div class="subnet-block-editor"><button type="button" class="subnet-action" aria-label="' +
        verb + ' ' + cidr + '" title="' + verb + ' ' + cidr + '">' +
        '<span>/' + cidr.split('/')[1] + '</span></button>' +
        '<label class="block-note-field">' +
        '<input type="text" class="block-note" data-subnet="' + cidr + '" placeholder=" ' +
        '" aria-label="' + cidr + ' ' + verb + ' Note" title="' + (note ? escapeHtml(note) : 'Click to add a note') +
        '" value="' + escapeHtml(note) + '">' +
        '<svg class="edit-hint" aria-hidden="true" focusable="false" viewBox="0 0 16 16">' +
        '<path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325"/>' +
        '</svg></label></div>'
}

$('#hierarchy_notes_tree').on('click', '.hierarchy-toggle', function() {
    const expanded = this.getAttribute('aria-expanded') === 'true'
    this.setAttribute('aria-expanded', String(!expanded))
    this.textContent = expanded ? '▸' : '▾'
    document.getElementById(this.getAttribute('aria-controls')).hidden = expanded
})

function validCidrKey(key) {
    if (typeof key !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}\/(3[0-2]|[12]?\d)$/.test(key)) return false
    const [address, mask] = key.split('/')
    if (!address.split('.').every(octet => Number(octet) <= 255)) return false
    // The address has to be the first address of its block. 10.0.0.128/18 is not a /18 network
    // at all, and two keys like it share a single Nth representation in a share link, so the
    // second one silently disappears. Splitting always produces aligned blocks.
    return ip2int(address) % 2 ** (32 - Number(mask)) === 0
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char])
}

// getSubnetNode(), get_matching_network_list() and count_network_children() each walk the
// whole tree to answer, and a render asks all three once per rendered cell, so drawing a
// design with n subnets costs O(n^2). Answer them from maps built in a single pass instead.
//
// The index holds live references to the nodes, so editing a note or a colour through it is
// fine — only the shape of the tree matters. A tree that is replaced wholesale is caught by
// the reference check in getSubnetIndex(); an in-place split or join, which keeps the same
// reference and swaps the nodes, is invalidated explicitly.
let subnetIndex = null
let subnetIndexTree = null

function invalidateSubnetIndex() {
    subnetIndex = null
}

function getSubnetIndex() {
    // Reassigning subnetMap replaces the node objects themselves — sortIPCIDRs() deep-copies
    // the tree, and so do changeBaseNetwork() and the import path — so the reference is what
    // identifies the tree the index was built from, and a reassignment rebuilds on its own.
    // An in-place split or join keeps the reference, and those invalidate explicitly.
    if (subnetIndex && subnetIndexTree === subnetMap) return subnetIndex

    const byCidr = new Map()
    const byAddress = new Map()
    const leavesUnder = new Map()
    const branches = new Set()

    // Post-order, matching what the recursive get_matching_network_list() returned: the
    // matches found inside a node come before the node itself, so descendants come first.
    function walk(tree) {
        let total = 0
        for (const key of Object.keys(tree)) {
            if (key.startsWith('_')) continue
            const node = tree[key]
            byCidr.set(key, node)
            let own
            if (has_network_sub_keys(node)) {
                branches.add(key)
                own = walk(node)
            } else {
                own = 1
            }
            leavesUnder.set(key, own)
            total += own
            const address = key.split('/')[0]
            const matches = byAddress.get(address)
            if (matches) matches.push(key)
            else byAddress.set(address, [key])
        }
        return total
    }
    walk(subnetMap)

    subnetIndex = { byCidr, byAddress, leavesUnder, branches }
    subnetIndexTree = subnetMap
    return subnetIndex
}

function getSubnetNode(cidr, tree = subnetMap) {
    if (tree === subnetMap) return getSubnetIndex().byCidr.get(cidr)
    for (const key of Object.keys(tree)) {
        if (key.startsWith('_')) continue
        if (key === cidr) return tree[key]
        const found = getSubnetNode(cidr, tree[key])
        if (found) return found
    }
}

function renderHierarchyNotes() {
    const container = document.getElementById('hierarchy_notes_tree')
    container.replaceChildren()
    let id = 0
    function visit(tree, target, depth) {
        for (const cidr of Object.keys(tree)) {
            if (cidr.startsWith('_')) continue
            const node = tree[cidr]
            const branch = has_network_sub_keys(node)
            const row = document.createElement('div')
            row.className = 'hierarchy-note-row'
            row.style.setProperty('--note-depth', Math.min(depth, 6))
            const inputId = 'hierarchy-note-' + id++
            const childrenId = inputId + '-children'
            row.innerHTML = (branch
                ? '<button type="button" class="hierarchy-toggle" aria-label="Toggle ' + cidr + '" aria-expanded="true" aria-controls="' + childrenId + '">▾</button>'
                : '<span class="hierarchy-leaf" aria-hidden="true">·</span>') +
                '<label for="' + inputId + '" class="font-monospace">' + cidr +
                '<small>' + (branch ? 'Parent' : 'Subnet') + ' · Level ' + depth + '</small></label>' +
                '<input id="' + inputId + '" class="form-control form-control-sm" type="text" aria-label="' + cidr + ' Hierarchy Note" data-subnet="' + cidr + '">'
            row.querySelector('input').value = node._note || ''
            target.appendChild(row)
            if (branch) {
                const children = document.createElement('div')
                children.id = childrenId
                target.appendChild(children)
                visit(node, children, depth + 1)
            }
        }
    }
    visit(sortIPCIDRs(subnetMap), container, 0)
}

function renderTable(operatingMode) {
    closeQuickColors()
    // The tree may have changed since the last draw; the index is rebuilt on first use.
    invalidateSubnetIndex()
    // TODO: Validation Code
    $('#calcbody').empty();
    let maxDepth = get_dict_max_depth(subnetMap, 0)
    addRowTree(subnetMap, 0, maxDepth, operatingMode)
    renderTableColumns(maxDepth)
    refreshColors()
}

function renderTableColumns(maxDepth) {
    const table = document.getElementById('calc')
    table.querySelectorAll('.column-resizer').forEach(handle => handle.remove())
    tableColumns = [
        { key: 'subnetHeader', label: 'Subnet Address', width: 200, min: 200 },
        { key: 'rangeHeader', label: 'Range of Addresses', width: 280, min: 160 },
        { key: 'useableHeader', label: 'Usable IPs', width: 280, min: 160 },
        { key: 'hostsHeader', label: 'Hosts', width: 120, min: 120 }
    ]
    for (let depth = maxDepth - 1; depth >= 0; depth--) {
        const prefix = Number(maxNetSize) + depth
        tableColumns.push({ key: 'prefix-' + prefix, label: '/' + prefix + ' Note', width: 160, min: 120 })
    }
    const spareWidth = Math.max(0, table.parentElement.clientWidth - 1 - tableColumns.reduce((sum, column) => sum + column.width, 0))
    if (!tableColumnWidths.size) {
        tableColumns[1].width += spareWidth / 2
        tableColumns[2].width += spareWidth / 2
    }
    const group = document.getElementById('calc_columns')
    group.replaceChildren()
    for (const column of tableColumns) {
        const savedWidth = tableColumnWidths.get(column.key)
        if (savedWidth) column.width = Math.max(column.min, savedWidth * table.parentElement.clientWidth / tableWidthReference)
        column.element = document.createElement('col')
        group.appendChild(column.element)
    }
    document.getElementById('treeHeader').colSpan = maxDepth
    tableColumns.slice(0, infoColumnCount).forEach(column => {
        addColumnResizer(document.getElementById(column.key), column)
    })
    table.querySelectorAll('td.split, td.join').forEach(cell => {
        const key = 'prefix-' + cell.dataset.subnet.split('/')[1]
        // renderTableColumns() derives one column per level from maxNetSize and maxDepth,
        // but an imported config can nest unevenly — a /24 holding /28s skips /25 to /27 —
        // so this prefix may have no column. Leave the cell without a resizer rather than
        // throwing, which would abandon the render and skip updating the rest of the UI.
        const column = tableColumns.find(column => column.key === key)
        if (column) addColumnResizer(cell, column)
    })
    applyTableColumnWidths()
}

function applyTableColumnWidths() {
    for (const column of tableColumns) {
        column.element.style.width = column.width + 'px'
        document.querySelectorAll('#calc .column-resizer[data-column="' + column.key + '"]').forEach(handle => {
            handle.setAttribute('aria-valuenow', Math.round(column.width))
        })
    }
    document.getElementById('calc').style.width = (1 + tableColumns.reduce((sum, column) => sum + column.width, 0)) + 'px'
    document.querySelectorAll('#calc input.block-note').forEach(input => {
        if (input !== document.activeElement) input.scrollLeft = 0
    })
}

function resizeTableColumn(column, width) {
    column.width = Math.max(column.min, width)
    // Freeze all current widths so resizing one column never shrinks its neighbors.
    tableColumns.forEach(item => tableColumnWidths.set(item.key, item.width))
    tableWidthReference = document.getElementById('calc').parentElement.clientWidth
    applyTableColumnWidths()
}

function addColumnResizer(cell, column) {
    const handle = document.createElement('span')
    handle.className = 'column-resizer'
    handle.dataset.column = column.key
    handle.tabIndex = 0
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', 'Resize ' + column.label)
    handle.setAttribute('aria-valuemin', column.min)
    handle.title = 'Drag to resize; use Left/Right arrow keys when focused'
    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return
        event.preventDefault()
        const startX = event.clientX
        const startWidth = column.width
        handle.setPointerCapture(event.pointerId)
        document.body.classList.add('resizing-columns')
        const move = event => resizeTableColumn(column, startWidth + event.clientX - startX)
        const finish = () => {
            document.body.classList.remove('resizing-columns')
            handle.removeEventListener('pointermove', move)
            handle.removeEventListener('pointerup', finish)
            handle.removeEventListener('pointercancel', finish)
            handle.removeEventListener('lostpointercapture', finish)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', finish)
        handle.addEventListener('pointercancel', finish)
        handle.addEventListener('lostpointercapture', finish)
    })
    handle.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        resizeTableColumn(column, column.width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10))
    })
    cell.appendChild(handle)
}

$('#btn_reset_columns').on('click', function() {
    tableColumnWidths.clear()
    renderTableColumns(get_dict_max_depth(subnetMap, 0))
})

// Browser zoom changes the available CSS width. Observe the container rather
// than freezing pixel widths after a drag; minimum widths keep cells readable.
let observedTableWidth = 0
new ResizeObserver(entries => {
    const width = entries[0].contentRect.width
    if (Math.abs(width - observedTableWidth) < 1) return
    observedTableWidth = width
    if (tableColumns.length) renderTableColumns(get_dict_max_depth(subnetMap, 0))
}).observe(document.getElementById('calc').parentElement)

function addRowTree(subnetTree, depth, maxDepth, operatingMode) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            addRowTree(subnetTree[mapKey], depth + 1, maxDepth,operatingMode)
        } else {
            let subnet_split = mapKey.split('/')
            let notesWidth = '30%';
            if ((maxDepth > 5) && (maxDepth <= 10)) {
                notesWidth = '25%';
            } else if ((maxDepth > 10) && (maxDepth <= 15)) {
                notesWidth = '20%';
            } else if ((maxDepth > 15) && (maxDepth <= 20)) {
                notesWidth = '15%';
            } else if (maxDepth > 20) {
                notesWidth = '10%';
            }
            addRow(subnet_split[0], parseInt(subnet_split[1]), (maxDepth - depth), (subnetTree[mapKey]['_note'] || ''), notesWidth, (subnetTree[mapKey]['_color'] || ''),operatingMode)
        }
    }
}

function addRow(network, netSize, colspan, note, notesWidth, color, operatingMode) {
    let addressFirst = ip2int(network)
    let addressLast = subnet_last_address(addressFirst, netSize)
    let usableFirst = subnet_usable_first(addressFirst, netSize, operatingMode)
    let usableLast = subnet_usable_last(addressFirst, netSize, operatingMode)
    let hostCount = 1 + usableLast - usableFirst
    let styleTag = ''
    if (validColor(color)) {
        styleTag = ' style="background-color: ' + color + '"'
    }

    let rangeCol, usableCol;
    if (netSize < 32) {
        rangeCol = int2ip(addressFirst) + ' - ' + int2ip(addressLast);
        usableCol = int2ip(usableFirst) + ' - ' + int2ip(usableLast);
    } else {
        rangeCol = int2ip(addressFirst);
        usableCol = int2ip(usableFirst);
    }
    let rowId = 'row_' + network.replace(/\./g, '-') + '_' + netSize
    let rowCIDR = network + '/' + netSize
    let newRow =
        '            <tr id="' + escapeHtml(rowId) + '"' + styleTag + '  aria-label="' + escapeHtml(rowCIDR) + '">\n' +
        '                <td data-subnet="' + escapeHtml(rowCIDR) + '" aria-labelledby="' + escapeHtml(rowId) + ' subnetHeader" class="row_address">' + escapeHtml(rowCIDR) + '</td>\n' +
        '                <td data-subnet="' + escapeHtml(rowCIDR) + '" aria-labelledby="' + escapeHtml(rowId) + ' rangeHeader" class="row_range">' + rangeCol + '</td>\n' +
        '                <td data-subnet="' + escapeHtml(rowCIDR) + '" aria-labelledby="' + escapeHtml(rowId) + ' useableHeader" class="row_usable">' + usableCol + '</td>\n' +
        '                <td data-subnet="' + escapeHtml(rowCIDR) + '" aria-labelledby="' + escapeHtml(rowId) + ' hostsHeader" class="row_hosts">' + hostCount + '</td>\n' +
        '                <td data-subnet="' + escapeHtml(rowCIDR) + '" aria-labelledby="' + escapeHtml(rowId) + ' splitHeader" rowspan="1" colspan="' + colspan + '" class="split" data-mutate-verb="split">' + subnetBlockEditor(rowCIDR, 'Split', note) + '</td>\n'
    if (netSize > maxNetSize) {
        // This is wrong. Need to figure out a way to get the number of children so you can set rowspan and the number
        // of ancestors so you can set colspan.
        // DONE: If the subnet address (without the mask) matches a larger subnet address
        // in the heirarchy that is a signal to add more join buttons to that row, since they start at the top row and
        // via rowspan extend downward.
        let matchingNetworkList = get_matching_network_list(network, subnetMap).slice(1)
        for (const i in matchingNetworkList) {
            let matchingNetwork = matchingNetworkList[i]
            let networkChildrenCount = count_network_children(matchingNetwork, subnetMap, [])
            newRow += '                <td aria-label="' + escapeHtml(matchingNetwork) + ' Join" rowspan="' + networkChildrenCount + '" colspan="1" class="join" data-subnet="' + escapeHtml(matchingNetwork) + '" data-mutate-verb="join">' + subnetBlockEditor(matchingNetwork, 'Join', getSubnetNode(matchingNetwork)._note || '') + '</td>\n'
        }
    }
    newRow += '            </tr>';

    $('#calcbody').append(newRow)
}


// Helper Functions
function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

function int2ip (ipInt) {
    return ((ipInt>>>24) + '.' + (ipInt>>16 & 255) + '.' + (ipInt>>8 & 255) + '.' + (ipInt & 255));
}

function toBase36(num) {
    return num.toString(36);
}

function fromBase36(str) {
    return parseInt(str, 36);
}

/**
 * Coordinate System for Subnet Representation
 *
 * This system aims to represent subnets efficiently within a larger network space.
 * The goal is to produce the shortest possible string representation for subnets,
 * which is particularly effective when dealing with hierarchical network designs.
 *
 * Key concept:
 * - We represent a subnet by its ordinal position within a larger network,
 *   along with its mask size.
 * - This approach is most efficient when subnets are relatively close together
 *   in the address space and of similar sizes.
 *
 * Benefits:
 * 1. Compact representation: Often results in very short strings (e.g., "7k").
 * 2. Hierarchical: Naturally represents subnet hierarchy.
 * 3. Efficient for common cases: Works best for typical network designs where
 *    subnets are grouped and of similar sizes.
 *
 * Trade-offs:
 * - Less efficient for representing widely dispersed or highly varied subnet sizes.
 * - Requires knowledge of the base network to interpret.
 *
 * Extreme Example... Representing the value 192.168.200.210/31 within the base
 * network of 192.168.200.192/27. These are arbitrary but long subnets to represent
 * as a string.
 * - Normal Way - '192.168.200.210/31'
 * - Nth Position Way - '9v'
 *   - '9' represents the 9th /31 subnet within the /27
 *   - 'v' represents the /31 mask size converted to Base 36 (31 -> 'v')
 */

/**
 * Converts a specific subnet to its Nth position representation within a base network.
 *
 * @param {string} baseNetwork - The larger network containing the subnet (e.g., "10.0.0.0/16")
 * @param {string} specificSubnet - The subnet to be represented (e.g., "10.0.112.0/20")
 * @returns {string} A compact string representing the subnet's position and size (e.g., "7k")
 */
function getNthSubnet(baseNetwork, specificSubnet) {
    const [baseIp, baseMask] = baseNetwork.split('/');
    const [specificIp, specificMask] = specificSubnet.split('/');

    const baseInt = ip2int(baseIp);
    const specificInt = ip2int(specificIp);

    const baseSize = 32 - parseInt(baseMask, 10);
    const specificSize = 32 - parseInt(specificMask, 10);

    const offset = specificInt - baseInt;
    const nthSubnet = offset >>> specificSize;

    return `${nthSubnet}${toBase36(parseInt(specificMask, 10))}`;
}


/**
 * Reconstructs a subnet from its Nth position representation within a base network.
 *
 * The representation is "[Nth as a decimal integer][mask in base36]", for example "0o" is the
 * 0th /24 (base36 'o' is 24) and "7k" is the 7th /20 within a /16.
 *
 * @param {string} baseNetwork - The larger network containing the subnet (e.g., "10.0.0.0/16")
 * @param {string} nthString - The compact representation of the subnet (e.g., "7k")
 * @returns {string|null} The full subnet representation (e.g., "10.0.112.0/20"), or null when
 *   nthString is not a subnet of baseNetwork.
 */
// Takes 10.0.0.0/16 and '7k' and returns 10.0.112.0/20 — the 7th /20 in the /16.
function getSubnetFromNth(baseNetwork, nthString) {
    const [baseIp, baseMask] = baseNetwork.split('/');
    const baseInt = ip2int(baseIp);

    // Decoding anything else still produces a plausible-looking CIDR, so a key that is not in
    // this form has to be refused rather than turned into a subnet outside the base network.
    if (typeof nthString !== 'string' || !/^\d+[0-9a-z]$/.test(nthString)) return null

    const size = fromBase36(nthString.slice(-1));
    if (size < parseInt(baseMask, 10) || size > 32) return null

    const nth = parseInt(nthString.slice(0, -1), 10);
    // The nth subnet of that size must fall inside the base network. Multiplying rather than
    // shifting keeps large nth values from wrapping the 32-bit result.
    if (nth >= 2 ** (size - parseInt(baseMask, 10))) return null

    return `${int2ip(baseInt + nth * 2 ** (32 - size))}/${size}`;
}

function subnet_last_address(subnet, netSize) {
    return subnet + subnet_addresses(netSize) - 1;
}

function subnet_addresses(netSize) {
    return 2**(32-netSize);
}

function subnet_usable_first(network, netSize, operatingMode) {
    if (netSize < 31) {
        // https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
        // AWS reserves 3 additional IPs
        // https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets
        // Azure reserves 3 additional IPs
        // https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet
        // OCI reserves 2 additional IPs
        //return network + (operatingMode == 'Standard' ? 1 : 4);
        switch (operatingMode) {
            case 'AWS':
            case 'AZURE':
                return network + 4;
                break;
            case 'OCI':
            case 'HUAWEI':
                return network + 2;
                break;
            default:
                return network + 1;
                break;
        }            
    } else {
        return network;
    }
}

function subnet_usable_last(network, netSize, mode = 'Standard') {
    let last_address = subnet_last_address(network, netSize);
    if (netSize < 31) {
        return last_address - (mode === 'HUAWEI' ? 3 : 1);
    } else {
        return last_address;
    }
}

function get_dict_max_depth(dict, curDepth) {
    let maxDepth = curDepth
    for (let mapKey in dict) {
        if (mapKey.startsWith('_')) { continue; }
        let newDepth = get_dict_max_depth(dict[mapKey], curDepth + 1)
        if (newDepth > maxDepth) { maxDepth = newDepth }
    }
    return maxDepth
}


function get_join_children(subnetTree, childCount) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            childCount += get_join_children(subnetTree[mapKey])
        } else {
            return childCount
        }
    }
}

function has_network_sub_keys(dict) {
    let allKeys = Object.keys(dict)
    // Maybe an efficient way to do this with a Lambda?
    for (let i in allKeys) {
        if (!allKeys[i].startsWith('_') && !['n', 'c', 'p'].includes(allKeys[i])) {
            return true
        }
    }
    return false
}

function count_network_children(network, subnetTree = subnetMap, ancestryList = []) {
    // Counts the unsplit networks underneath a key. The index already has the leaf count for
    // every key, and the recursive version never counted a node as its own descendant, so a
    // key that is itself a leaf contributes nothing.
    if (subnetTree === subnetMap) {
        const index = getSubnetIndex()
        const leaves = index.leavesUnder.get(network) || 0
        return index.branches.has(network) ? leaves : Math.max(leaves - 1, 0)
    }
    let childCount = 0
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            childCount += count_network_children(network, subnetTree[mapKey], ancestryList.concat([mapKey]))
        } else {
            if (ancestryList.includes(network)) {
                childCount += 1
            }
        }
    }
    return childCount
}

function get_network_children(network, subnetTree) {
    // TODO: This might be able to be optimized. Ultimately it needs to count the number of keys underneath
    // the current key are unsplit networks (IE rows in the table, IE keys with a value of {}).
    let subnetList = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            subnetList.push.apply(subnetList, get_network_children(network, subnetTree[mapKey]))
        } else {
            subnetList.push(mapKey)
        }
    }
    return subnetList
}

function get_matching_network_list(network, subnetTree = subnetMap) {
    // Callers only read the result, and the index holds it in the same order the recursion
    // below produces, so hand out the indexed list directly.
    if (subnetTree === subnetMap) return getSubnetIndex().byAddress.get(network) || []
    let subnetList = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            subnetList.push.apply(subnetList, get_matching_network_list(network, subnetTree[mapKey]))
        }
        if (mapKey.split('/')[0] === network) {
            subnetList.push(mapKey)
        }
    }
    return subnetList
}

function get_consolidated_property(subnetTree, property) {
    let allValues = get_property_values(subnetTree, property)
    // https://stackoverflow.com/questions/14832603/check-if-all-values-of-array-are-equal
    let allValuesMatch = allValues.every( (val, i, arr) => val === arr[0] )
    if (allValuesMatch) {
        return allValues[0]
    } else {
        return ''
    }
}

function get_property_values(subnetTree, property) {
    let propValues = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) continue
        if (has_network_sub_keys(subnetTree[mapKey])) {
            propValues.push.apply(propValues, get_property_values(subnetTree[mapKey], property))
        } else {
            // The "else" above is a bit different because it will start tracking values for subnets which are
            // in the hierarchy, but not displayed. Those are always blank so it messes up the value list
            propValues.push(subnetTree[mapKey][property] || '')
        }
    }
    return propValues
}

function get_network(networkInput, netSize) {
    let ipInt = ip2int(networkInput)
    netSize = parseInt(netSize)
    for (let i=31-netSize; i>=0; i--) {
        ipInt &= ~ 1<<i;
    }
    return int2ip(ipInt);
}

function split_network(networkInput, netSize) {
    let subnets = [networkInput + '/' + (netSize + 1)]
    let newSubnet = ip2int(networkInput) + 2**(32-netSize-1);
    subnets.push(int2ip(newSubnet) + '/' + (netSize + 1))
    return subnets;
}

function mutate_subnet_map(verb, network, subnetTree, propValue = '') {
    // A split or a join changes the shape of the tree, which is what the index caches. Notes
    // and colours change a node in place, and the index holds the node itself, so they do not
    // need to invalidate anything.
    if (verb === 'split' || verb === 'join') invalidateSubnetIndex()
    if (subnetTree === '') { subnetTree = subnetMap }
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            mutate_subnet_map(verb, network, subnetTree[mapKey], propValue)
        }
        if (mapKey === network) {
            let netSplit = mapKey.split('/')
            let netSize = parseInt(netSplit[1])
            if (verb === 'split') {
                if (netSize < minSubnetSizes[operatingMode]) {
                    let new_networks = split_network(netSplit[0], netSize)
                    // Could maybe optimize this for readability with some null coalescing
                    subnetTree[mapKey][new_networks[0]] = {}
                    subnetTree[mapKey][new_networks[1]] = {}
                    // Children inherit the initial note, while the parent keeps its own note.
                    if (subnetTree[mapKey].hasOwnProperty('_note')) {
                        subnetTree[mapKey][new_networks[0]]['_note'] = subnetTree[mapKey]['_note']
                        subnetTree[mapKey][new_networks[1]]['_note'] = subnetTree[mapKey]['_note']
                    }
                    if (subnetTree[mapKey].hasOwnProperty('_color')) {
                        subnetTree[mapKey][new_networks[0]]['_color'] = subnetTree[mapKey]['_color']
                        subnetTree[mapKey][new_networks[1]]['_color'] = subnetTree[mapKey]['_color']
                    }
                    if (subnetTree[mapKey]._cellColors) {
                        for (const child of new_networks) subnetTree[mapKey][child]._cellColors = { ...subnetTree[mapKey]._cellColors }
                    }
                    delete subnetTree[mapKey]['_color']
                } else {
                    switch (operatingMode) {
                        case 'HUAWEI':
                            var modal_error_message = 'The minimum IPv4 subnet size for Huawei Cloud is /28.<br/><a href="' + huaweiSubnetDocs + '" target="_blank" rel="noopener noreferrer">Huawei Cloud subnet documentation</a>'
                            break;
                        case 'AWS':
                            var modal_error_message = 'The minimum IPv4 subnet size for AWS is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer">Amazon Virtual Private Cloud > User Guide > Subnet CIDR Blocks > Subnet Sizing for IPv4</a>'
                            break;
                        case 'AZURE':
                            var modal_error_message = 'The minimum IPv4 subnet size for Azure is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#how-small-and-how-large-can-virtual-networks-and-subnets-be" target="_blank" rel="noopener noreferrer">Azure Virtual Network FAQ > How small and how large can virtual networks and subnets be?</a>'
                            break;
                        case 'OCI':
                            var modal_error_message = 'The minimum IPv4 subnet size for OCI is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer">Infrastructure Services>Networking>Networking Overview>Three IP Addresses in Each Subnet</a>'
                            break;
                        default:
                            var modal_error_message = 'The minimum size for an IPv4 subnet is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing" target="_blank" rel="noopener noreferrer">Wikipedia - Classless Inter-Domain Routing</a>'
                            break;
                    }
                    show_warning_modal('<div>' + modal_error_message + '</div>')
                }
            } else if (verb === 'join') {
                // Restore this level's note; legacy trees without one consolidate leaf notes.
                subnetTree[mapKey] = {
                    ...(subnetTree[mapKey]._cellColors ? { _cellColors: { ...subnetTree[mapKey]._cellColors } } : {}),
                    '_note': subnetTree[mapKey]['_note'] ?? get_consolidated_property(subnetTree[mapKey], '_note'),
                    '_color': get_consolidated_property(subnetTree[mapKey], '_color')
                }
            } else if (verb === 'note') {
                subnetTree[mapKey]['_note'] = propValue
            } else if (verb === 'color') {
                subnetTree[mapKey]['_color'] = propValue
            } else {
                // How did you get here?
            }
        }
    }
}

function switchMode(operatingMode) {

    let isSwitched = true;

    if (subnetMap !== null) {
        if (validateSubnetSizes(subnetMap, minSubnetSizes[operatingMode])) {

            set_usable_ips_title(operatingMode);
            renderTable(operatingMode);

            $('#netsize').attr('pattern', netsizePatterns[operatingMode]);
            $('#input_form').removeClass('was-validated');
            $('#input_form').rules('remove', 'netsize');

            switch (operatingMode) {
                case 'HUAWEI':
                    var validate_error_message = 'Huawei Cloud Mode - Smallest size is /28'
                    break;
                case 'AWS':
                    var validate_error_message = 'AWS Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                case 'AZURE':
                    var validate_error_message = 'Azure Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                case 'OCI':
                    var validate_error_message = 'OCI Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                default:
                    var validate_error_message = 'Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
            }


            // Modify jquery validation rule
            $('#input_form #netsize').rules('add', {
                required: true,
                pattern: netsizePatterns[operatingMode],
                messages: {
                    required: 'Please enter a network size',
                    pattern: validate_error_message
                }
            });
            // Remove active class from all buttons if needed
            $('#dropdown_standard, #dropdown_azure, #dropdown_aws, #dropdown_oci, #dropdown_huawei').removeClass('active');
            $('#dropdown_' + operatingMode.toLowerCase()).addClass('active');
            isSwitched = true;
        } else {
            switch (operatingMode) {
                case 'HUAWEI':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for Huawei Cloud.<br/>The smallest size allowed is /28.<br/><a href="' + huaweiSubnetDocs + '" target="_blank" rel="noopener noreferrer">Huawei Cloud subnet documentation</a>'
                    break;
                case 'AWS':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for AWS.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer">Amazon Virtual Private Cloud > User Guide > Subnet CIDR Blocks > Subnet Sizing for IPv4</a>'
                    break;
                case 'AZURE':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for Azure.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#how-small-and-how-large-can-virtual-networks-and-subnets-be" target="_blank" rel="noopener noreferrer">Azure Virtual Network FAQ > How small and how large can virtual networks and subnets be?</a>'
                    break;
                case 'OCI':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for OCI.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer">Infrastructure Services>Networking>Networking Overview>Three IP Addresses in Each Subnet</a>'
                    break;
                default:
                    var validate_error_message = 'Unknown Error'
                    break;
            }
            show_warning_modal('<div>' + modal_error_message + '</div>');
            isSwitched = false;
        }
    } else {
        //unlikely to get here.
        reset();
    }

    return isSwitched;


}

function validateSubnetSizes(subnetMap, minSubnetSize) {
    let isValid = true;
    const validate = (subnetTree) => {
        for (let key in subnetTree) {
            if (key.startsWith('_')) continue; // Skip special keys
            let [_, size] = key.split('/');
            if (parseInt(size) > minSubnetSize) {
                isValid = false;
                return; // Early exit if any subnet is invalid
            }
            if (typeof subnetTree[key] === 'object') {
                validate(subnetTree[key]); // Recursively validate subnets
            }
        }
    };
    validate(subnetMap);
    return isValid;
}


function set_usable_ips_title(operatingMode) {
    switch (operatingMode) {
        case 'HUAWEI':
            $('#useableHeader').html('Usable IPs (<a href="' + huaweiSubnetDocs + '" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom:1px dotted #000; text-decoration:dotted" data-bs-toggle="tooltip" data-bs-placement="top" title="Huawei Cloud reserves 5 addresses per subnet by default: the first two and the last three. Custom gateway settings may change reserved addresses.">Huawei Cloud</a>)')
            break;
        case 'AWS':
            $('#useableHeader').html('Usable IPs (<a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="AWS reserves 5 addresses in each subnet for platform use.<br/>Click to navigate to the AWS documentation.">AWS</a>)')
            break;
        case 'AZURE':
            $('#useableHeader').html('Usable IPs (<a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="Azure reserves 5 addresses in each subnet for platform use.<br/>Click to navigate to the Azure documentation.">Azure</a>)')
            break;
        case 'OCI':
            $('#useableHeader').html('Usable IPs (<a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="OCI reserves 3 addresses in each subnet for platform use.<br/>Click to navigate to the OCI documentation.">OCI</a>)')
            break;
        default:
            $('#useableHeader').html('Usable IPs')
            break;
    }
    $('[data-bs-toggle="tooltip"]').tooltip()
}

function show_warning_modal(message) {
    var notifyModal = new bootstrap.Modal(document.getElementById('notifyModal'), {});
    $('#notifyModal .modal-body').html(message)
    notifyModal.show()
}

$( document ).ready(function() {

    // Initialize the jQuery Validation on the form
    var validator = $('#input_form').validate({
        onfocusout: function (element) {
            $(element).valid();
        },
        rules: {
            network: {
                required: true,
                pattern: '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
            },
            netsize: {
                required: true,
                pattern: '^([0-9]|[12][0-9]|3[0-2])$'
            }
        },
        messages: {
            network: {
                required: 'Please enter a network',
                pattern: 'Must be a valid IPv4 Address'
            },
            netsize: {
                required: 'Please enter a network size',
                pattern: 'Smallest size is /32'
            }
        },
        errorPlacement: function(error, element) {
            //console.log(error);
            //console.log(element);
            if (error[0].innerHTML !== '') {
                //console.log('Error Placement - Text')
                if (!element.data('errorIsVisible')) {
                    bootstrap.Tooltip.getInstance(element).setContent({'.tooltip-inner': error[0].innerHTML})
                    element.tooltip('show');
                    element.data('errorIsVisible', true)
                }
            } else {
                //console.log('Error Placement - Empty')
                //console.log(element);
                if (element.data('errorIsVisible')) {
                    element.tooltip('hide');
                    element.data('errorIsVisible', false)
                }

            }
            //console.log(element);
        },
        // This success function appears to be required as errorPlacement() does not fire without the success function
        // being defined.
        success: function(label, element) { },
        // When the form is valid, add the 'was-validated' class
        submitHandler: function(form) {
            form.classList.add('was-validated');
            form.submit(); // Submit the form
        }
    });

    let autoConfigResult = processConfigUrl();
    if (!autoConfigResult) {
        reset();
    }
});

function exportConfig(isMinified = true) {
    const baseNetwork = Object.keys(subnetMap)[0]
    let miniSubnetMap = {};
    subnetMap = sortIPCIDRs(subnetMap)
    if (isMinified) {
        minifySubnetMap(miniSubnetMap, subnetMap, baseNetwork)
    }
    if (operatingMode !== 'Standard') {
        return {
            'config_version': configVersion,
            'operating_mode': operatingMode,
            'base_network': baseNetwork,
            'subnets': isMinified ? miniSubnetMap : subnetMap,
            ...(Object.keys(defaultBlockColors).some(key => blockColors[key] !== defaultBlockColors[key]) ? { block_colors: { ...blockColors } } : {}),
            ...(colorLegend.size ? { color_legend: Object.fromEntries(colorLegend) } : {}),
        }
    } else {
        return {
            'config_version': configVersion,
            'base_network': baseNetwork,
            'subnets': isMinified ? miniSubnetMap : subnetMap,
            ...(Object.keys(defaultBlockColors).some(key => blockColors[key] !== defaultBlockColors[key]) ? { block_colors: { ...blockColors } } : {}),
            ...(colorLegend.size ? { color_legend: Object.fromEntries(colorLegend) } : {}),
        }
    }
}

function getConfigUrl() {
    // Deep Copy
    let defaultExport = JSON.parse(JSON.stringify(exportConfig(true)));
    renameKey(defaultExport, 'config_version', 'v')
    renameKey(defaultExport, 'base_network', 'b')
    if (defaultExport.hasOwnProperty('operating_mode')) {
        renameKey(defaultExport, 'operating_mode', 'm')
    }
    renameKey(defaultExport, 'subnets', 's')
    //console.log(JSON.stringify(defaultExport))
    const pageUrl = new URL('index.html', window.location.href)
    return pageUrl.pathname + '?c=' + urlVersion + LZString.compressToEncodedURIComponent(JSON.stringify(defaultExport))
}

function processConfigUrl() {
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });
    if (params['c'] === null) return false
    // A share link is untrusted input: it can be truncated by a chat client, have its
    // fragment mangled, or simply be mistyped. Never let a bad one break the page.
    try {
        // First character is the version of the URL string, in case the mechanism of encoding changes
        let urlVersion = params['c'].substring(0, 1)
        let urlData = params['c'].substring(1)
        let urlConfig = JSON.parse(LZString.decompressFromEncodedURIComponent(urlData))
        if (!urlConfig || typeof urlConfig !== 'object' || Array.isArray(urlConfig)) {
            throw new Error('Share link did not contain a configuration object')
        }
        renameKey(urlConfig, 'v', 'config_version')
        if (urlConfig.hasOwnProperty('m')) {
            renameKey(urlConfig, 'm', 'operating_mode')
        }
        renameKey(urlConfig, 's', 'subnets')
        if (!urlConfig.hasOwnProperty('subnets') || typeof urlConfig['subnets'] !== 'object' || urlConfig['subnets'] === null) {
            throw new Error('Share link did not contain a subnet map')
        }
        if (urlConfig['config_version'] === '1') {
            // Version 1 Configs used full subnet strings as keys and just shortned the _note->_n and _color->_c keys
            expandKeys(urlConfig['subnets'])
        } else if (urlConfig['config_version'] === '2') {
            // Version 2 Configs uses the Nth Position representation for subnet keys and requires the base_network
            // option. It also uses n/c for note/color
            if (urlConfig.hasOwnProperty('b')) {
                renameKey(urlConfig, 'b', 'base_network')
            }
            if (typeof urlConfig['base_network'] !== 'string') {
                throw new Error('Share link is missing its base network')
            }
            let expandedSubnetMap = {};
            expandSubnetMap(expandedSubnetMap, urlConfig['subnets'], urlConfig['base_network'])
            urlConfig['subnets'] = expandedSubnetMap
        } else {
            throw new Error('Unsupported share link version')
        }
        // importConfig() refuses a configuration it cannot use and explains why, so do not
        // replace that explanation with the generic message below.
        if (!importConfig(urlConfig)) return false
        return true
    } catch (error) {
        // The caller falls back to reset(), which renders the default design.
        show_warning_modal('<div>This share link could not be read, so the default design has been loaded instead.</div><div class="pt-2">The link may be incomplete or corrupted. Ask the sender to copy it again.</div>')
        return false
    }
}

function minifySubnetMap(minifiedMap, referenceMap, baseNetwork) {
    for (let subnet in referenceMap) {
        if (subnet.startsWith('_')) continue;

        const nthRepresentation = getNthSubnet(baseNetwork, subnet);
        minifiedMap[nthRepresentation] = {}
        if (referenceMap[subnet].hasOwnProperty('_note')) {
            minifiedMap[nthRepresentation]['n'] = referenceMap[subnet]['_note']
        }
        if (referenceMap[subnet].hasOwnProperty('_color')) {
            minifiedMap[nthRepresentation]['c'] = referenceMap[subnet]['_color']
        }
        if (referenceMap[subnet]._cellColors) minifiedMap[nthRepresentation]['p'] = referenceMap[subnet]._cellColors
        if (Object.keys(referenceMap[subnet]).some(key => !key.startsWith('_'))) {
            minifySubnetMap(minifiedMap[nthRepresentation], referenceMap[subnet], baseNetwork);
        }
    }
}

function expandSubnetMap(expandedMap, miniMap, baseNetwork) {
    for (let mapKey in miniMap) {
        if (mapKey === 'n' || mapKey === 'c' || mapKey === 'p') {
            continue;
        }
        // A version 2 key is normally "[Nth][mask in base36]", but a full CIDR is unambiguous —
        // an nth string never contains a dot or a slash — and it is what people write by hand.
        let subnetKey = validCidrKey(mapKey) ? mapKey : getSubnetFromNth(baseNetwork, mapKey)
        if (subnetKey === null) {
            throw new Error('Subnet key ' + JSON.stringify(mapKey) + ' is not a subnet of ' + baseNetwork)
        }
        expandedMap[subnetKey] = {}
        if (has_network_sub_keys(miniMap[mapKey])) {
            expandSubnetMap(expandedMap[subnetKey], miniMap[mapKey], baseNetwork)
        }
        if (miniMap[mapKey].hasOwnProperty('n')) {
            expandedMap[subnetKey]['_note'] = miniMap[mapKey]['n']
        }
        if (miniMap[mapKey].hasOwnProperty('c')) {
            expandedMap[subnetKey]['_color'] = miniMap[mapKey]['c']
        }
        if (miniMap[mapKey].p) expandedMap[subnetKey]._cellColors = miniMap[mapKey].p
    }
}

// For Config Version 1 Backwards Compatibility
function expandKeys(subnetTree) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) {
            continue;
        }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            expandKeys(subnetTree[mapKey])
        } else {
            if (subnetTree[mapKey].hasOwnProperty('_n')) {
                renameKey(subnetTree[mapKey], '_n', '_note')
            }
            if (subnetTree[mapKey].hasOwnProperty('_c')) {
                renameKey(subnetTree[mapKey], '_c', '_color')
            }

        }
    }
}

function renameKey(obj, oldKey, newKey) {
    if (oldKey === newKey) return
    const descriptor = Object.getOwnPropertyDescriptor(obj, oldKey)
    // A payload may already use the long name, or leave the field out entirely, and then there
    // is no short key to move. Leave it alone so a well-formed configuration written with the
    // long names loads instead of throwing; the callers validate what they actually need.
    if (!descriptor) return
    Object.defineProperty(obj, newKey, descriptor)
    delete obj[oldKey]
}

const validOperatingModes = ['Standard', 'AZURE', 'AWS', 'OCI', 'HUAWEI']

// Describes what is wrong with a configuration, or returns null when it is usable.
//
// A configuration is untrusted input whether it arrives as a share link or pasted into the
// import box, and importConfig() writes straight into globals and the form. Checking the shape
// in one place means a bad one is refused as a whole, with a reason, instead of throwing from
// somewhere inside the render or quietly leaving the form blank.
function validateConfig(text) {
    if (!text || typeof text !== 'object' || Array.isArray(text)) {
        return 'A configuration has to be a JSON object.'
    }
    const version = text['config_version']
    if (version !== '1' && version !== '2') {
        return 'The configuration version must be "1" or "2"' +
            (version === undefined ? '.' : ', not "' + version + '".')
    }
    if (version === '2' && !validCidrKey(text['base_network'])) {
        return 'A version 2 configuration needs a base_network such as "10.0.0.0/16".'
    }
    const subnets = text['subnets']
    if (!subnets || typeof subnets !== 'object' || Array.isArray(subnets) || !Object.keys(subnets).length) {
        return 'The configuration does not contain any subnets.'
    }
    if (!validSubnetTree(subnets)) {
        return 'The configuration contains invalid subnet entries.'
    }
    if (text.hasOwnProperty('operating_mode') && !validOperatingModes.includes(text['operating_mode'])) {
        return 'The configuration asks for an unknown operating mode. Valid values are ' +
            validOperatingModes.join(', ') + '.'
    }
    return null
}

function importConfig(text) {
    const problem = validateConfig(text)
    if (problem) {
        // Refuse without touching the current design: the caller decides what to show instead.
        show_warning_modal('<div>This configuration was not imported.</div><div class="pt-2">' + escapeHtml(problem) + '</div>')
        return false
    }
    inactiveColorMeanings = new Map()
    colorLegend = new Map()
    document.getElementById('color_legend_rows').replaceChildren()
    document.getElementById('color_legend').hidden = true
    if (text.color_legend && typeof text.color_legend === 'object' && !Array.isArray(text.color_legend)) {
        for (const [color, meaning] of Object.entries(text.color_legend)) {
            if (!validColor(color) || typeof meaning !== 'string') continue
            colorLegend.set(color.toLowerCase(), meaning)
        }
        colorLegend.forEach((meaning, color) => appendColorLegendRow(color, meaning))
    }
    blockColors = { ...defaultBlockColors }
    for (const kind of ['split', 'join']) {
        if (validColor(text.block_colors?.[kind])) blockColors[kind] = text.block_colors[kind]
    }
    colorUndo.length = 0
    $('#undo_color').prop('disabled', true)
    if (text['config_version'] === '1') {
        var [subnetNet, subnetSize] = Object.keys(text['subnets'])[0].split('/')
    } else if (text['config_version'] === '2') {
        var [subnetNet, subnetSize] = text['base_network'].split('/')
    }
    $('#network').val(subnetNet)
    $('#netsize').val(subnetSize)
    maxNetSize = subnetSize
    subnetMap = sortIPCIDRs(text['subnets']);
    // switchMode() refuses a mode that the loaded subnets are too small for, and leaves the
    // UI on the previous mode. Put the global back and re-render the imported design there,
    // otherwise the table would show the old design while subnetMap holds the new one, and
    // later splits would apply a mode the user cannot see.
    const requestedMode = text['operating_mode'] || 'Standard'
    const previousMode = operatingMode
    operatingMode = requestedMode
    if (!switchMode(requestedMode)) {
        operatingMode = previousMode
        if (!switchMode(previousMode)) {
            // The previous mode cannot take this design either. Standard accepts any valid
            // subnet tree, so it always produces a table.
            operatingMode = 'Standard'
            switchMode('Standard')
        }
    }
    return true
}

function validSubnetTree(tree) {
    // A node has to be an object: sortIPCIDRs() calls Object.keys() on every value, so a null
    // or an array or a string would throw well after the point where it could be explained.
    if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return false
    for (const key in tree) {
        if (key.startsWith('_')) continue
        if (!validCidrKey(key)) return false
        if (!validSubnetTree(tree[key])) return false
    }
    return true
}

function sortIPCIDRs(obj) {
  // Base case: if the value is an empty object, return it
  if (typeof obj === 'object' && Object.keys(obj).length === 0) {
    return {};
  }

  // Separate CIDR entries from metadata
  const entries = Object.entries(obj);
  const cidrEntries = entries.filter(([key]) => !key.startsWith('_'));
  const metadataEntries = entries.filter(([key]) => key.startsWith('_'));

  // Sort CIDR entries by IP address
  const sortedCIDREntries = cidrEntries.sort((a, b) => {
    const ipA = a[0].split('/')[0].split('.').map(Number);
    const ipB = b[0].split('/')[0].split('.').map(Number);

    for (let i = 0; i < 4; i++) {
      if (ipA[i] !== ipB[i]) {
        return ipA[i] - ipB[i];
      }
    }
    return 0;
  });

  // Create sorted object, starting with metadata
  const sortedObj = {};

  // Add sorted CIDR entries with recursion
  for (const [key, value] of sortedCIDREntries) {
    sortedObj[key] = typeof value === 'object' ? sortIPCIDRs(value) : value;
  }

  // Add metadata entries (unsorted, as they appeared in original)
  for (const [key, value] of metadataEntries) {
    sortedObj[key] = value;
  }

  return sortedObj;
}

function rgba2hex(rgba) {
    return `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/).slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`
}
