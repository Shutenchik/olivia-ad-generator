'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, ImageIcon, AlertCircle } from 'lucide-react'
import { useCanvasStore } from '@/store/canvas'
import { cn } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

const ACCEPTED_TYPES = { 'image/jpeg': [], 'image/png': [], 'image/webp': [] }
const MAX_SIZE_BYTES = 10_000_000

interface UploadZoneProps {
  sessionId: string
  onUploadComplete?: (assetId: string, signedUrl: string) => void
  onAnalysisTriggered?: (message: string) => void
}

type UploadState = 'idle' | 'uploading' | 'confirming' | 'done' | 'error'

export default function UploadZone({ sessionId, onUploadComplete, onAnalysisTriggered }: UploadZoneProps) {
  const { addLayer, canvasWidth, canvasHeight } = useCanvasStore()
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMessage(null)
      setUploadState('uploading')
      setProgress(10)

      const localPreview = URL.createObjectURL(file)
      setPreview(localPreview)

      try {
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
            sessionId,
          }),
        })

        if (!presignRes.ok) throw new Error('Failed to get upload URL')

        const { uploadUrl, assetId, r2Key } = (await presignRes.json()) as {
          uploadUrl: string
          assetId: string
          r2Key: string
        }

        setProgress(30)

        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })

        setProgress(70)
        setUploadState('confirming')

        const confirmRes = await fetch('/api/upload/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId }),
        })

        if (!confirmRes.ok) throw new Error('File validation failed')

        const { signedUrl } = (await confirmRes.json()) as { assetId: string; signedUrl: string }

        setProgress(100)
        setUploadState('done')

        const img = new Image()
        img.onload = () => {
          const aspectRatio = img.width / img.height
          const targetWidth = canvasWidth * 0.6
          const targetHeight = targetWidth / aspectRatio

          addLayer({
            id: uuidv4(),
            type: 'image',
            name: 'product',
            src: signedUrl,
            x: (canvasWidth - targetWidth) / 2,
            y: (canvasHeight - targetHeight) / 2,
            width: targetWidth,
            height: targetHeight,
            rotation: 0,
            opacity: 1,
            blendMode: 'normal',
            locked: false,
            visible: true,
          })

          onUploadComplete?.(assetId, signedUrl)
          onAnalysisTriggered?.(
            `I've uploaded ${file.name}. Please analyze it and suggest ad backgrounds.`,
          )
        }
        img.src = localPreview
      } catch (err) {
        setUploadState('error')
        setErrorMessage(err instanceof Error ? err.message : 'Upload failed')
        setPreview(null)
      }
    },
    [sessionId, addLayer, canvasWidth, canvasHeight, onUploadComplete, onAnalysisTriggered],
  )

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE_BYTES,
    maxFiles: 1,
    onDropAccepted: ([file]) => {
      if (file) handleFile(file)
    },
    onDropRejected: (rejections) => {
      const first = rejections[0]
      const error = first?.errors[0]
      if (error?.code === 'file-too-large') {
        setErrorMessage('File too large. Max 10MB.')
      } else if (error?.code === 'file-invalid-type') {
        setErrorMessage('Only JPEG, PNG, and WebP are supported.')
      } else {
        setErrorMessage('Invalid file.')
      }
      setUploadState('error')
    },
  })

  if (preview && (uploadState === 'done' || uploadState === 'uploading' || uploadState === 'confirming')) {
    return (
      <div className="relative rounded-lg overflow-hidden aspect-square">
        <img src={preview} alt="Uploaded product" className="w-full h-full object-cover" />
        {uploadState !== 'done' && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
            <div className="w-full max-w-[80%] bg-[#27272A] rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-[#E8D5B0] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-[#E8D5B0]">
              {uploadState === 'uploading' ? 'Uploading…' : 'Validating…'}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200',
        isDragActive
          ? 'border-[#E8D5B0] bg-[#E8D5B0]/5'
          : 'border-[#27272A] hover:border-[#71717A] hover:bg-[#1A1A1D]',
        uploadState === 'error' && 'border-[#F87171]/50',
      )}
    >
      <input {...getInputProps()} aria-label="Upload product image" />

      <div
        className={cn(
          'p-3 rounded-full transition-colors',
          isDragActive ? 'bg-[#E8D5B0]/10' : 'bg-[#1A1A1D]',
        )}
      >
        {uploadState === 'error' ? (
          <AlertCircle className="w-6 h-6 text-[#F87171]" />
        ) : isDragActive ? (
          <ImageIcon className="w-6 h-6 text-[#E8D5B0]" />
        ) : (
          <Upload className="w-6 h-6 text-[#71717A]" />
        )}
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-[#FAFAF9]">
          {isDragActive ? 'Drop to upload' : 'Upload product image'}
        </p>
        <p className="text-xs text-[#71717A] mt-1">JPEG, PNG, WebP · Max 10MB</p>
      </div>

      {errorMessage && (
        <p className="text-xs text-[#F87171] text-center">{errorMessage}</p>
      )}
    </div>
  )
}
