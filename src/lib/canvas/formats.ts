import type { CanvasFormat } from '@/types/canvas'

export const CANVAS_FORMATS: Record<
  CanvasFormat,
  { width: number; height: number; label: string; platform: string }
> = {
  '1:1': { width: 1080, height: 1080, label: 'Square', platform: 'Instagram Feed' },
  '4:5': { width: 1080, height: 1350, label: 'Portrait', platform: 'Instagram Feed' },
  '9:16': { width: 1080, height: 1920, label: 'Story', platform: 'Instagram Story / TikTok' },
  '16:9': { width: 1920, height: 1080, label: 'Landscape', platform: 'Facebook / YouTube' },
}
