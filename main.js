import './guify.min.js'

const PARAM_DEFS = [
  {
    key: 'image_src_type',
    label: 'image source',
    type: 'select',
    opts: {
      options: ['url', 'file'],
    },
    gen_default: () => 'url',
  },
  {
    key: 'image_src',
    label: 'image URL',
    gen_default: () => 'http://placekitten.com/400/400',
  },
  {
    key: 'image_file',
    label: 'image file',
    type: 'file',
    unhashable: true,
    parser: raw => {
      function dataURItoBlob(dataURI) {
        const byteString = atob(dataURI.split(',')[1])
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab)
        for (var i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i)
        }
        return new Blob([ab], { type: mimeString })
      }
      const blob = dataURItoBlob(raw)
      blob.id = Math.random()
      return blob
    },
  },
  {
    key: 'base_amplitude',
    label: 'slice height',
    type: 'range',
    opts: {
      min: 0.1,
      max: 1,
    },
    gen_default: () => 0.7,
    parser: raw => parseFloat(raw, 10),
  },
  ...(['x', 'y'].map((xy) => ({
    key: `${xy}_step`,
    label: `${xy} resolution`,
    type: 'range',
    opts: {
      min: 1,
      max: 100,
      scale: 'log',
    },
    gen_default: () => 4,
    parser: raw => parseInt(raw, 10),
  }))),
  {
    key: 'xy_jitter',
    type: 'range',
    opts: {
      min: 0,
      max: 10,
    },
    gen_default: () => 0.1,
    parser: raw => parseFloat(raw, 10),
  },
  {
    key: 'flicker_rate',
    type: 'range',
    opts: {
      min: 0,
      max: 1,
      step: 0.05,
      precision: 1,
    },
    gen_default: () => 0.25,
    parser: raw => parseFloat(raw, 10),
  },
  {
    key: 'random_seed',
    type: 'range',
    opts: {
      min: 0,
      max: 1e6,
      step: 1,
      precision: 0,
    },
    gen_default: () => 1,
    parser: raw => parseInt(raw, 10),
  },
]

const IMAGE_CACHE = {}

async function main() {
  const state = {
    params: Object.assign({}, gen_default_params(), get_hash_params()),
  }
  const debounced_set_hash_params = debounce(set_hash_params, 5e2)
  state.update_params = (updates) => {
    state.params = Object.assign({}, state.params, updates)
    const hashable_params = {}
    for (const param_def of PARAM_DEFS) {
      const value = state.params[param_def.key]
      if (value === undefined) { continue }
      if (param_def.unhashable) { continue }
      hashable_params[param_def.key] = value
    }
    debounced_set_hash_params(hashable_params)
  }
  const ui = create_ui({ state })
  await render({ ui, state })
}

function gen_default_params() {
  const default_params = {}
  for (const param_def of PARAM_DEFS) {
    const default_value = param_def.gen_default?.()
    if (default_value !== undefined) {
      default_params[param_def.key] = default_value
    }
  }
  return default_params
}

function get_hash_params() {
  const parsed_hash_params = {}
  const raw_hash_params = get_raw_hash_params()
  for (const param_def of PARAM_DEFS) {
    const raw_value = raw_hash_params[param_def.key]
    if (raw_value === undefined) { continue }
    const parsed_value = param_def.parser?.(raw_value) ?? raw_value
    parsed_hash_params[param_def.key] = parsed_value
  }
  return parsed_hash_params
}

function get_raw_hash_params() {
  return Object.fromEntries(new URLSearchParams(window.location.hash.substring(1)).entries())
}

function set_hash_params(params) {
  const search_params = new URLSearchParams(params)
  window.location.hash = search_params.toString()
}

function debounce(func, delay, { leading } = {}) {
  let timerId
  function debounced_func(...args) {
    if (!timerId && leading) {
      func(...args)
    }
    clearTimeout(timerId)
    timerId = setTimeout(() => func(...args), delay)
  }
  return debounced_func
}

function create_ui({ state }) {
  const ui = {}

  ui.container = create_element({
    attributes: { id: 'container' },
    styles: {
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'hsl(0, 0%, 50%)',
      backgroundImage: 'radial-gradient(hsl(0, 0%, 30%) 0.5px, transparent 0.5px), radial-gradient(hsl(0, 0%, 40%) 0.5px, hsl(0, 0%, 50%) 0.5px)',
      backgroundSize: '20px 20px',
      backgroundPosition: '0 0,10px 10px',
    },
  })

  ui.gui = new guify({
    title: '<span>The Scrambler (<a style="color: inherit" href="https://github.com/adorsk/scrambler/" target="_blank">ABOUT</a>) <a style="color: inherit" href="https://forms.gle/sPG8z2z9oY3dgSr86" target="_blank">(Guestbook)</a></span>',
    open: true,
  })
  for (const param_def of PARAM_DEFS) {
    ui[param_def.key] = ui.gui.Register({
      type: param_def.type ?? 'text',
      label: param_def.label ?? param_def.key,
      initial: state.params[param_def.key] ?? '',
      onChange(raw) {
        state.update_params({
          [param_def.key]: param_def.parser?.(raw) ?? raw
        })
        render({ ui, state })
      },
      ...(param_def.opts ?? {}),
    })
  }

  let animating = false
  function frame() {
    if (!animating) { return }
    // Increment random seed.
    ui.random_seed.SetValue((state.params.random_seed + 1) % ui.random_seed.opts.max)
    ui.random_seed.opts.onChange(ui.random_seed.GetValue())
    requestAnimationFrame(frame)
  }
  ui.gui.Register({
    type: 'button',
    label: 'scramble!',
    action() {
      animating = !animating
      state.params.random_seed = 0
      requestAnimationFrame(frame)
    },
  })

  ui.images_container = create_element({
    parent: ui.container,
    styles: {
      flexGrow: 1,
      minHeight: 0,
      display: 'flex',
      position: 'relative',
      padding: '4px',
    },
  })

  ui.input_canvas = create_element({
    tag: 'canvas',
    attributes: { id: 'input_canvas' },
    parent: ui.images_container,
    styles: {
      position: 'absolute',
      top: '40px',
      right: '40px',
      maxWidth: '60px',
      maxHeight: '60px',
      border: 'thin solid hsla(0, 0%, 20%, 0.5)',
    },
  })

  ui.output_canvas = create_element({
    tag: 'canvas',
    attributes: { id: 'output_canvas' },
    parent: ui.images_container,
    styles: {
      maxWidth: '100%',
      maxHeight: '100%',
      margin: '0 auto',
      objectFit: 'contain',
      border: 'thin solid hsla(0, 0%, 20%, 0.5)',
    },
  })

  return ui
}

function create_element({
  tag = 'div',
  attributes,
  parent = document.body,
  styles,
} = {}) {
  const element = document.createElement(tag)
  Object.assign(element, attributes)
  if (styles) { Object.assign(element.style, styles) }
  if (parent) { parent.appendChild(element) }
  return element
}

async function render({ ui, state }) {
  const { params } = state
  const image = await load_image({ ui, params })
  draw_image_to_canvas({
    image,
    canvas: ui.input_canvas,
  })
  const rows = gen_rows({
    x_0: 0,
    x_1: ui.input_canvas.width,
    x_step: params.x_step,
    y_0: 0,
    y_1: ui.input_canvas.height,
    y_step: params.y_step,
  })
  decorate_rows_with_aggregate_values({ rows, canvas: ui.input_canvas })
  draw_rows({
    rows,
    canvas: ui.output_canvas,
    params,
  })
}

async function load_image({ ui, params }) {
  const { image_src_type } = params
  let cache_key
  let get_src
  if (image_src_type === 'url') {
    cache_key = params.image_src
    get_src = () => params.image_src
  } else if (image_src_type === 'file') {
    cache_key = `FILE:${params.image_file?.id}`
    get_src = () => {
      if (!params.image_file) {
        throw new Error('No file provided yet')
      }
      return URL.createObjectURL(params.image_file)
    }
  }
  if (!IMAGE_CACHE[cache_key]) {
    IMAGE_CACHE[cache_key] = new Promise((resolve, reject) => {
      ui.gui.Toast('Loading...', 1e3, 1e3)
      try {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.crossOrigin = 'anonymous'
        image.src = get_src()
        ui.gui.Toast('Loaded!', 1e3, 1e3)
      } catch (error) {
        ui.gui.Toast(`ERROR: ${error.message}`)
        reject(error)
      }
    })
  }
  return IMAGE_CACHE[cache_key]
}

function draw_image_to_canvas({ image, canvas }) {
  canvas.height = image.height
  canvas.width = image.width
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
}

function gen_rows({ x_0, x_1, x_step, y_0, y_1, y_step }) {
  const rows = []
  for (let y = y_0; y < y_1; y += y_step) {
    const height = Math.min(y + y_step, y_1) - y
    const row = { cells: [], y, height }
    for (let x = x_0; x < x_1; x += x_step) {
      const width = Math.min(x + x_step, x_1) - x
      const cell = { x, y, width, height }
      row.cells.push(cell)
    }
    rows.push(row)
  }
  return rows
}

function decorate_rows_with_aggregate_values({ rows, canvas }) {
  const image_data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
  for (const row of rows) {
    for (const cell of row.cells) {
      const pixels = get_pixels_for_region({
        region: {
          type: 'rect',
          x: cell.x,
          y: cell.y,
          height: cell.height,
          width: cell.width,
        },
        image_data
      })
      cell.grayscale_value = compute_grayscale_value_for_pixels({ pixels })
      cell.rms_rgb = compute_rms_rgb_for_pixels({ pixels })
    }
  }
}

function get_pixels_for_region({ region, image_data }) {
  if (region.type === 'rect') {
    const pixels = []
    for (let x = region.x; x < region.x + region.width; x++) {
      for (let y = region.y; y < region.y + region.height; y++) {
        pixels.push(get_pixel_for_xy({ x, y, image_data }))
      }
    }
    return pixels
  }
  throw new Error(`Invalid region type '${region.type}'`)
}

function get_pixel_for_xy({ x, y, image_data }) {
  const pixel = []
  const start_index = ((y * image_data.width) + x) * 4
  for (let i = 0; i < 4; i++) {
    pixel.push(image_data.data[start_index + i])
  }
  return pixel
}

function compute_grayscale_value_for_pixels({ pixels }) {
  // Per: https://en.wikipedia.org/wiki/Grayscale#Colorimetric_(perceptual_luminance-preserving)_conversion_to_grayscale
  const grayscale = pixels.reduce(function(avg, pixel, _, { length }) {
    const grayscale_for_pixel = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]
    return avg + (grayscale_for_pixel / length)
  }, 0)
  return grayscale
}

function compute_rms_rgb_for_pixels({ pixels }) {
  const rgb_square_sums = [0, 0, 0]
  for (const pixel of pixels) {
    for (let i = 0; i < 3; i++) {
      rgb_square_sums[i] += pixel[i] ** 2
    }
  }
  const rms_rgb = rgb_square_sums.map(square_sum => (square_sum / pixels.length) ** 0.5)
  return rms_rgb
}

function draw_rows({ rows, canvas, params, }) {
  const prng = gen_pseudo_random_number_generator(params.random_seed)
  const ctx = canvas.getContext('2d')
  const last_cell = rows.at(-1).cells.at(-1)
  ctx.canvas.width = last_cell.x + last_cell.width
  ctx.canvas.height = last_cell.y + last_cell.height
  const shuffled_rows = (prng() > params.flicker_rate) ? rows : shuffle({ items: rows, random: prng })
  let current_y = 0
  for (const row of shuffled_rows) {
    const { cells } = row
    const cell = cells.at(0)
    const y = current_y + (0.5 * row.height)
    const path_height = params.base_amplitude * row.height
    let normalized_amplitudes = cells.map(cell => cell.grayscale_value / 255.0)
    if (params.invert) {
      normalized_amplitudes = normalized_amplitudes.map(a => 1 - a)
    }
    const path_points = []
    normalized_amplitudes.forEach((amplitude, i) => {
      path_points.push([cells.at(i).x, y + (amplitude * path_height)])
    })
    path_points.push([ctx.canvas.width + 10, path_points.at(-1)[1]])
    normalized_amplitudes.toReversed().forEach((amplitude, i) => {
      path_points.push([cells.at((-1 * i) - 1).x, y - (amplitude * path_height)])
    })

    const { xy_jitter } = params
    for (const path_point of path_points) {
      path_point[0] += xy_jitter * (-0.5 + prng()) * params.x_step
      path_point[1] += xy_jitter * (-0.5 + prng()) * path_height
    }

    for (const cell of cells) {
      //ctx.fillStyle = `hsl(0, 0%, ${100 - cell.grayscale_value * 100}%)`
      const hsl = rgb_values_to_hsl_values(cell.rms_rgb)
      const complement_hsl_string = `hsl(${(hsl[0] + 180) % 360}, ${hsl[1] * 10}%, ${hsl[2] * 100}%)`
      ctx.fillStyle = complement_hsl_string
      ctx.fillRect(cell.x, current_y, cell.width, row.height)
    }

    const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0)
    for (const cell of cells) {
      const rgb_string = `rgb(${cell.rms_rgb.map(Math.floor).join(', ')})`
      const jittered_rgb = jitter_rgb({ rgb_string, jitter: 10, random: prng })
      gradient.addColorStop(cell.x / ctx.canvas.width, jittered_rgb)
    }
    ctx.fillStyle = gradient

    ctx.beginPath()
    ctx.moveTo(0, y)
    for (const [x, y] of path_points) {
      ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()

    current_y += row.height
  }
}

function shuffle({ items, random }) {
  const copy = [...items]
  const shuffled = []
  while (copy.length) {
    shuffled.push(copy.splice(Math.floor(random() * copy.length), 1)[0])
  }
  return shuffled
}

function gen_pseudo_random_number_generator(seed) {
  function mulberry32_prng() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  return mulberry32_prng
}

function jitter_rgb({ rgb_string, jitter, random }) {
  const [h, s, l] = rgb_values_to_hsl_values(rgb_string_to_values(rgb_string))
  const jittered_h = Math.round(h + jitter * (-0.5 + random())) % 360
  return hsl_values_to_hsl_string([jittered_h, s, l])
}

function rgb_string_to_values(rgb_string) {
  return rgb_string.slice(4, -1).split(',').map(v => parseInt(v, 10))
}

function rgb_values_to_string(rgb_values) {
  return `rgb(${rgb_values.join(',')})`
}

function rgb_values_to_hsl_values(rgb_values) {
  // Per: https://css-tricks.com/converting-color-spaces-in-javascript/
  let h = 0, s = 0, l = 0
  const [r, g, b] = rgb_values.map(v => v / 255)
  // find greatest and smallest channel values
  const cmin = Math.min(r, g, b)
  const cmax = Math.max(r, g, b)
  const delta = cmax - cmin
  // calculate hue
  if (delta == 0) {
    h = 0
  } else if (cmax == r) {
    h = ((g - b) / delta) % 6
  } else if (cmax == g) {
    h = (b - r) / delta + 2
  } else if (cmax == b) {
    h = (r - g) / delta + 4
  }
  h = Math.round(h * 60)
  if (h < 0) { h += 360 }
  // calculate lightness
  l = (cmax + cmin) / 2
  // calculate saturation
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
  }
  return [h, s, l]
}

function hsl_values_to_hsl_string(hsl_values) {
  const [h, s, l] = hsl_values
  return `hsl(${h}, ${s * 100}%, ${l * 100}%)`
}

main().catch(err => console.error(err))


