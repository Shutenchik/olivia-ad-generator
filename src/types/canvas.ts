export type CanvasFormat = '1:1' | '4:5' | '9:16' | '16:9'

export interface ImageLayer {
  id: string
  type: 'image'
  name: string
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  blendMode: string
  locked: boolean
  visible: boolean
}

export interface TextLayer {
  id: string
  type: 'text'
  name: string
  text: string
  x: number
  y: number
  fontFamily: string
  fontSize: number
  fontWeight: string
  fill: string
  rotation: number
  width: number
  locked: boolean
  visible: boolean
}

export interface ShapeLayer {
  id: string
  type: 'shape'
  name: string
  shapeType: 'rect' | 'circle'
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  rotation: number
  opacity: number
  locked: boolean
  visible: boolean
}

export type Layer = ImageLayer | TextLayer | ShapeLayer
