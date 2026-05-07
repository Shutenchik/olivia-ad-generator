import Konva from 'konva'
import type { Layer } from '@/types/canvas'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 60)}`))
    img.src = src
  })
}

interface RenderOptions {
  layers: Layer[]
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  pixelRatio?: number
  background?: string
}

export async function renderLayersToDataUrl(opts: RenderOptions): Promise<string> {
  const {
    layers,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    pixelRatio = 2,
    background = '#1A1A1D',
  } = opts

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.pointerEvents = 'none'
  document.body.appendChild(container)

  const stage = new Konva.Stage({ container, width: outputWidth, height: outputHeight })
  const konvaLayer = new Konva.Layer()
  stage.add(konvaLayer)

  konvaLayer.add(
    new Konva.Rect({ x: 0, y: 0, width: outputWidth, height: outputHeight, fill: background }),
  )

  const scale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight)
  const offsetX = (outputWidth - sourceWidth * scale) / 2
  const offsetY = (outputHeight - sourceHeight * scale) / 2

  const orderedLayers = [
    ...layers.filter((l) => l.type === 'image' && l.name === 'background'),
    ...layers.filter((l) => !(l.type === 'image' && l.name === 'background')),
  ]

  try {
    for (const l of orderedLayers) {
      if (!l.visible) continue

      if (l.type === 'image') {
        const img = await loadImage(l.src).catch(() => null)
        if (!img) continue
        konvaLayer.add(
          new Konva.Image({
            image: img,
            x: l.x * scale + offsetX,
            y: l.y * scale + offsetY,
            width: l.width * scale,
            height: l.height * scale,
            rotation: l.rotation,
            opacity: l.opacity,
          }),
        )
        continue
      }

      if (l.type === 'text') {
        konvaLayer.add(
          new Konva.Text({
            text: l.text,
            x: l.x * scale + offsetX,
            y: l.y * scale + offsetY,
            fontSize: l.fontSize * scale,
            fontFamily: l.fontFamily,
            fontStyle: l.fontWeight,
            fill: l.fill,
            rotation: l.rotation,
            width: l.width * scale,
          }),
        )
        continue
      }

      if (l.type === 'shape') {
        const common = {
          x: l.x * scale + offsetX,
          y: l.y * scale + offsetY,
          width: l.width * scale,
          height: l.height * scale,
          fill: l.fill,
          stroke: l.stroke,
          strokeWidth: l.strokeWidth * scale,
          rotation: l.rotation,
          opacity: l.opacity,
        }
        if (l.shapeType === 'rect') {
          konvaLayer.add(new Konva.Rect(common))
        } else {
          konvaLayer.add(
            new Konva.Circle({
              ...common,
              radius: Math.min(common.width, common.height) / 2,
            }),
          )
        }
      }
    }

    konvaLayer.draw()
    return stage.toDataURL({ pixelRatio, mimeType: 'image/png' })
  } finally {
    stage.destroy()
    container.remove()
  }
}

export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : ''
}
