export interface ChatDraftAttachment {
  id: string
  type: 'image'
  assetId: string
  url: string
  name?: string
  size?: number
  width?: number
  height?: number
  mimeType: string
  base64?: string
}

export interface ChatDraftState {
  text: string
  attachments: ChatDraftAttachment[]
}
