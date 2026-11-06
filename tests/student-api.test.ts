import { describe, expect, test } from 'bun:test'
import {
  ASSESSMENT_AUDIO_SAMPLE_RATE,
  AudioCompositionError,
  audioFilename,
  combineReadingsToWav,
  concatenateMonoReadings,
  encodeMonoPcm16Wav,
  joinMonoReadingsWithSilence,
  maxCombinedSpeechDurationSeconds,
  maxCombinedWavSamples,
  resampleMonoAudio,
  resampleChannelsToMono,
  validateCombinedAudioDuration,
} from '../src/student-api'

describe('reading audio composition helpers', () => {
  test('concatenates the two decoded readings in order', () => {
    const combined = concatenateMonoReadings([
      new Float32Array([0.1, 0.2]),
      new Float32Array([-0.3, -0.4]),
    ])

    expect(Array.from(combined)).toEqual(Array.from(new Float32Array([0.1, 0.2, -0.3, -0.4])))
  })

  test('resamples mono PCM to the requested sample rate', () => {
    const resampled = resampleMonoAudio(new Float32Array([0, 0.5, 1, 0.5]), 4, 2)

    expect(Array.from(resampled)).toEqual([0, 1])
    expect(ASSESSMENT_AUDIO_SAMPLE_RATE).toBe(16_000)
  })

  test('keeps reading order and inserts silence between the two readings', () => {
    const samples = joinMonoReadingsWithSilence([
      new Float32Array([0.25, 0.5]),
      new Float32Array([-0.5, -0.25]),
    ], 4, 0.5)
    const wav = encodeMonoPcm16Wav(samples, 4)

    expect(Array.from(samples)).toEqual([0.25, 0.5, 0, 0, -0.5, -0.25])
    return wav.arrayBuffer().then(bytes => {
      const view = new DataView(bytes)
      expect(view.getInt16(44, true)).toBe(8_192)
      expect(view.getInt16(46, true)).toBe(16_384)
      expect(view.getInt16(48, true)).toBe(0)
      expect(view.getInt16(50, true)).toBe(0)
      expect(view.getInt16(52, true)).toBe(-16_384)
      expect(view.getInt16(54, true)).toBe(-8_192)
    })
  })

  test('reserves the boundary gap and WAV header from the capture budget', () => {
    const bytesFor45Seconds = 44 + (45 * 16_000 * 2)

    expect(maxCombinedSpeechDurationSeconds(60, bytesFor45Seconds)).toBe(44)
    expect(maxCombinedSpeechDurationSeconds(42, bytesFor45Seconds)).toBe(41)
    expect(maxCombinedWavSamples(60, 44 + 100 * 2)).toBe(100)
  })

  test('caps resampling and trims encoder overshoot from the end of Reading 2', () => {
    const mixed = resampleChannelsToMono([
      new Float32Array([0, 1, 2, 3]),
      new Float32Array([1, 2, 3, 4]),
    ], 4, 2, 1)
    const boundedJoin = joinMonoReadingsWithSilence([
      new Float32Array([0.25, 0.5]),
      new Float32Array([-0.5, -0.25, 0.75]),
    ], 4, 0.5, 6)

    expect(Array.from(mixed)).toEqual([0.5])
    expect(Array.from(boundedJoin)).toEqual([0.25, 0.5, 0, 0, -0.5, -0.25])
  })

  test('rejects a composed recording below the server minimum', () => {
    expect(() => validateCombinedAudioDuration(39.99, {
      minimumDurationSeconds: 40,
      maxDurationSeconds: 90,
      maxBytes: 3_000_000,
    })).toThrow('at least 40 seconds')
  })

  test('rejects oversized source blobs before constructing a decoder', async () => {
    const first = new Blob([new Uint8Array(30)])
    const second = new Blob([new Uint8Array(30)])

    await expect(combineReadingsToWav(first, second, {
      maxDurationSeconds: 60,
      maxBytes: 50,
    })).rejects.toMatchObject({ code: 'bytes' } satisfies Partial<AudioCompositionError>)
  })

  test('writes a mono 16-bit PCM WAV header and clipped sample data', async () => {
    const wav = encodeMonoPcm16Wav(new Float32Array([-1, 0.5, 2]))
    const bytes = await wav.arrayBuffer()
    const view = new DataView(bytes)
    const ascii = (offset: number, length: number) =>
      Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join('')

    expect(wav.type).toBe('audio/wav')
    expect(wav.size).toBe(50)
    expect(ascii(0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(42)
    expect(ascii(8, 4)).toBe('WAVE')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(ascii(36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(6)
    expect(view.getInt16(44, true)).toBe(-32_768)
    expect(view.getInt16(46, true)).toBe(16_384)
    expect(view.getInt16(48, true)).toBe(32_767)
  })

  test('uses the WAV filename for the normalized submission blob', () => {
    expect(audioFilename(new Blob([], { type: 'audio/wav' }))).toBe('recording.wav')
    expect(audioFilename(new Blob([], { type: 'audio/mpeg' }))).toBe('recording.mp3')
    expect(audioFilename(new Blob([], { type: 'video/quicktime' }))).toBe('recording.mov')
    expect(audioFilename(new Blob([], { type: 'video/mp4' }))).toBe('recording.mp4')
  })
})
