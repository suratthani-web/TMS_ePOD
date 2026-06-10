import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadFileToSupabase } from './supabase-upload'
import { createAdminClient } from '@/utils/supabase/server'

vi.mock('@/utils/supabase/server', () => ({
  createAdminClient: vi.fn(),
}))

describe('uploadFileToSupabase', () => {
  const mockStorage = {
    from: vi.fn().mockReturnThis(),
    upload: vi.fn(),
    getPublicUrl: vi.fn(),
  }

  const mockSupabase = {
    storage: mockStorage,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(createAdminClient as unknown as { mockReturnValue: (val: unknown) => void }).mockReturnValue(mockSupabase)
  })

  it('should upload a file and return the public URL', async () => {
    const buffer = Buffer.from('test')
    const fileName = 'test.jpg'
    const mimeType = 'image/jpeg'
    const folderName = 'TestFolder'

    mockStorage.upload.mockResolvedValue({ data: { path: 'TestFolder/test.jpg' }, error: null })
    mockStorage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'http://example.com/test.jpg' } })

    const result = await uploadFileToSupabase(buffer, fileName, mimeType, folderName)

    expect(mockStorage.from).toHaveBeenCalledWith('company-assets')
    expect(mockStorage.upload).toHaveBeenCalledWith('TestFolder/test.jpg', buffer, {
      contentType: mimeType,
      upsert: true,
    })
    expect(result.directLink).toBe('http://example.com/test.jpg')
  })

  it('should throw an error if the upload fails', async () => {
    const buffer = Buffer.from('test')
    mockStorage.upload.mockResolvedValue({ data: null, error: new Error('Upload failed') })

    await expect(uploadFileToSupabase(buffer, 'test.jpg', 'image/jpeg')).rejects.toThrow('Upload failed')
  })
})
