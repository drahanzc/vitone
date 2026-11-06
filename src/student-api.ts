import { apiUrl, type components } from './api'

export type PublicLink = components['schemas']['PublicLinkResponse']
export type AssessmentSubmissionResponse = components['schemas']['CreatedAssessmentResponse']
export type AssessmentStatus = components['schemas']['AssessmentStatusResponse']
export type StudentReport = components['schemas']['AssessmentReport']
export type ReportItem = components['schemas']['ReportItem']

export type SavedReportSession = {
  assessmentId: string
  assessmentToken: string
  passageTitle: string
}

export const ASSESSMENT_AUDIO_SAMPLE_RATE = 16_000
export const READING_SEPARATION_SECONDS = 1
export const MIN_AUDIO_SECONDS_PER_READING = 20
const WAV_HEADER_BYTES = 44
const MAX_ENCODER_OVERSHOOT_SECONDS = 0.5

export type AudioCompositionLimits = {
  minimumDurationSeconds?: number
  maxDurationSeconds: number
  maxBytes: number
}

export type CombinedAudio = {
  audio: Blob
  durationSeconds: number
}

export type AudioCompositionErrorCode = 'empty' | 'unsupported' | 'decode' | 'duration' | 'duration-too-short' | 'bytes'

export class AudioCompositionError extends Error {
  readonly code: AudioCompositionErrorCode

  constructor(code: AudioCompositionErrorCode, message: string) {
    super(message)
    this.name = 'AudioCompositionError'
    this.code = code
  }
}

/** Maximum combined speech duration after reserving the boundary gap and the WAV header. */
export function maxCombinedSpeechDurationSeconds(maxDurationSeconds: number, maxBytes: number): number {
  const maxFrames = maxCombinedWavSamples(maxDurationSeconds, maxBytes)
  return Math.max(0, maxFrames / ASSESSMENT_AUDIO_SAMPLE_RATE - READING_SEPARATION_SECONDS)
}

export function maxCombinedWavSamples(maxDurationSeconds: number, maxBytes: number): number {
  const maxDurationFrames = Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0
    ? Math.floor(maxDurationSeconds * ASSESSMENT_AUDIO_SAMPLE_RATE)
    : 0
  const maxByteFrames = Number.isFinite(maxBytes) && maxBytes > WAV_HEADER_BYTES
    ? Math.floor((maxBytes - WAV_HEADER_BYTES) / 2)
    : 0
  return Math.max(0, Math.min(maxDurationFrames, maxByteFrames))
}

export function validateCombinedAudioDuration(durationSeconds: number, limits: AudioCompositionLimits): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AudioCompositionError('empty', 'The readings contain no usable audio.')
  }
  if (durationSeconds > limits.maxDurationSeconds) {
    throw new AudioCompositionError('duration', `The combined readings exceed the ${limits.maxDurationSeconds}-second limit.`)
  }
  if (limits.minimumDurationSeconds !== undefined && durationSeconds < limits.minimumDurationSeconds) {
    throw new AudioCompositionError(
      'duration-too-short',
      `The combined recording must be at least ${limits.minimumDurationSeconds} seconds long. Record longer readings before submitting.`,
    )
  }
}

/** Joins already-decoded mono readings in their supplied order. */
export function concatenateMonoReadings(readings: readonly Float32Array[]): Float32Array {
  const totalLength = readings.reduce((total, reading) => total + reading.length, 0)
  const combined = new Float32Array(totalLength)
  let offset = 0
  for (const reading of readings) {
    combined.set(reading, offset)
    offset += reading.length
  }
  return combined
}

/** Joins mono readings with a silent gap so downstream transcript splitting can find the boundary. */
export function joinMonoReadingsWithSilence(
  readings: readonly Float32Array[],
  sampleRate = ASSESSMENT_AUDIO_SAMPLE_RATE,
  gapSeconds = READING_SEPARATION_SECONDS,
  maxOutputSamples = Number.MAX_SAFE_INTEGER,
): Float32Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('The sample rate must be a positive integer.')
  }
  if (!Number.isFinite(gapSeconds) || gapSeconds < 0) {
    throw new RangeError('The silent gap must be a non-negative number of seconds.')
  }
  if (!Number.isSafeInteger(maxOutputSamples) || maxOutputSamples < 0) {
    throw new RangeError('The maximum output sample count must be a non-negative safe integer.')
  }
  const gapSamples = readings.length > 1 ? Math.ceil(sampleRate * gapSeconds) : 0
  const fixedLength = readings.slice(0, -1).reduce((total, reading) => total + reading.length, 0)
    + gapSamples * Math.max(0, readings.length - 1)
  if (fixedLength > maxOutputSamples) {
    throw new RangeError('The first reading and boundary gap exceed the available audio limit.')
  }
  const lastReading = readings.at(-1)
  const lastReadingLength = lastReading ? Math.min(lastReading.length, maxOutputSamples - fixedLength) : 0
  const sampleCount = fixedLength + lastReadingLength
  const combined = new Float32Array(sampleCount)
  let offset = 0
  readings.forEach((reading, index) => {
    const sampleLength = index === readings.length - 1 ? lastReadingLength : reading.length
    combined.set(reading.subarray(0, sampleLength), offset)
    offset += sampleLength
    if (index < readings.length - 1) offset += gapSamples
  })
  return combined
}

/** Resamples mono PCM with linear interpolation. */
export function resampleMonoAudio(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = ASSESSMENT_AUDIO_SAMPLE_RATE,
  maxOutputSamples = Number.MAX_SAFE_INTEGER,
): Float32Array {
  if (!Number.isInteger(sourceSampleRate) || sourceSampleRate <= 0) {
    throw new RangeError('The source sample rate must be a positive integer.')
  }
  if (!Number.isInteger(targetSampleRate) || targetSampleRate <= 0) {
    throw new RangeError('The target sample rate must be a positive integer.')
  }
  if (!Number.isSafeInteger(maxOutputSamples) || maxOutputSamples < 0) {
    throw new RangeError('The maximum output sample count must be a non-negative safe integer.')
  }
  if (sourceSampleRate === targetSampleRate) return samples.slice(0, maxOutputSamples)

  const outputLength = Math.min(Math.round(samples.length * targetSampleRate / sourceSampleRate), maxOutputSamples)
  const output = new Float32Array(outputLength)
  const scale = sourceSampleRate / targetSampleRate
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * scale
    const left = Math.min(Math.floor(sourcePosition), samples.length - 1)
    const right = Math.min(left + 1, samples.length - 1)
    const fraction = sourcePosition - left
    output[index] = (samples[left] ?? 0) * (1 - fraction) + (samples[right] ?? 0) * fraction
  }
  return output
}

/** Mixes decoded channels to mono and resamples with an output allocation cap. */
export function resampleChannelsToMono(
  channels: readonly Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = ASSESSMENT_AUDIO_SAMPLE_RATE,
  maxOutputSamples = Number.MAX_SAFE_INTEGER,
): Float32Array {
  if (!Number.isInteger(sourceSampleRate) || sourceSampleRate <= 0) {
    throw new RangeError('The source sample rate must be a positive integer.')
  }
  if (!Number.isInteger(targetSampleRate) || targetSampleRate <= 0) {
    throw new RangeError('The target sample rate must be a positive integer.')
  }
  if (!Number.isSafeInteger(maxOutputSamples) || maxOutputSamples < 0) {
    throw new RangeError('The maximum output sample count must be a non-negative safe integer.')
  }
  if (channels.length === 0) return new Float32Array()
  const sourceLength = channels[0]?.length ?? 0
  if (channels.some(channel => channel.length !== sourceLength)) {
    throw new RangeError('Decoded audio channels must have matching lengths.')
  }

  const expectedLength = sourceSampleRate === targetSampleRate
    ? sourceLength
    : Math.round(sourceLength * targetSampleRate / sourceSampleRate)
  const outputLength = Math.min(expectedLength, maxOutputSamples)
  const output = new Float32Array(outputLength)
  const scale = sourceSampleRate / targetSampleRate
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * scale
    const left = Math.min(Math.floor(sourcePosition), sourceLength - 1)
    const right = Math.min(left + 1, sourceLength - 1)
    const fraction = sourcePosition - left
    let value = 0
    for (const channel of channels) {
      value += ((channel[left] ?? 0) * (1 - fraction) + (channel[right] ?? 0) * fraction) / channels.length
    }
    output[index] = value
  }
  return output
}

/** Encodes mono floating-point samples as a standard 16-bit PCM RIFF/WAVE file. */
export function encodeMonoPcm16Wav(
  samples: Float32Array,
  sampleRate = ASSESSMENT_AUDIO_SAMPLE_RATE,
): Blob {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('The WAV sample rate must be a positive integer.')
  }
  const dataBytes = samples.length * 2
  if (dataBytes + WAV_HEADER_BYTES > 0xffff_ffff) {
    throw new RangeError('The WAV recording is too large to encode.')
  }

  const bytes = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(bytes)
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    const pcm = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
    view.setInt16(WAV_HEADER_BYTES + index * 2, pcm, true)
  }

  return new Blob([bytes], { type: 'audio/wav' })
}

function audioBufferChannels(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel))
}

/** Decodes two independent browser recordings and combines them as one mono 16 kHz WAV. */
export async function combineReadingsToWav(
  reading1: Blob,
  reading2: Blob,
  limits: AudioCompositionLimits,
): Promise<CombinedAudio> {
  if (reading1.size === 0 || reading2.size === 0) {
    throw new AudioCompositionError('empty', 'One of the readings has no captured audio.')
  }
  if (reading1.size + reading2.size > limits.maxBytes) {
    throw new AudioCompositionError('bytes', 'The captured readings exceed the allowed source audio size.')
  }
  if (typeof globalThis.AudioContext === 'undefined') {
    throw new AudioCompositionError('unsupported', 'This browser cannot process the captured audio.')
  }

  const maxOutputSamples = maxCombinedWavSamples(limits.maxDurationSeconds, limits.maxBytes)
  const gapSamples = Math.ceil(ASSESSMENT_AUDIO_SAMPLE_RATE * READING_SEPARATION_SECONDS)
  const maxSpeechSamples = maxOutputSamples - gapSamples
  if (maxSpeechSamples <= 0) {
    throw new AudioCompositionError('bytes', 'The allowed file size cannot fit both readings and their boundary gap.')
  }

  let context: AudioContext | null = null
  try {
    context = new AudioContext()
    let firstBuffer: AudioBuffer | null = await context.decodeAudioData(await reading1.arrayBuffer())
    const firstDuration = firstBuffer.duration
    const firstExpectedSamples = Math.round(firstBuffer.length * ASSESSMENT_AUDIO_SAMPLE_RATE / firstBuffer.sampleRate)
    const firstMaxDuration = maxSpeechSamples / ASSESSMENT_AUDIO_SAMPLE_RATE
    if (!Number.isFinite(firstDuration) || firstDuration <= 0 || firstDuration > firstMaxDuration + MAX_ENCODER_OVERSHOOT_SECONDS) {
      throw new AudioCompositionError('duration', 'Reading 1 is longer than the allowed duration. Re-record it with a shorter duration.')
    }
    if (firstExpectedSamples <= 0 || firstExpectedSamples > maxSpeechSamples) {
      throw new AudioCompositionError('duration', 'Reading 1 leaves no room for Reading 2 within the allowed duration.')
    }
    const firstSamples = resampleChannelsToMono(
      audioBufferChannels(firstBuffer),
      firstBuffer.sampleRate,
      ASSESSMENT_AUDIO_SAMPLE_RATE,
      maxSpeechSamples,
    )
    firstBuffer = null

    const secondBuffer = await context.decodeAudioData(await reading2.arrayBuffer())
    const remainingSecondSamples = maxOutputSamples - gapSamples - firstSamples.length
    const remainingSecondDuration = remainingSecondSamples / ASSESSMENT_AUDIO_SAMPLE_RATE
    const secondDuration = secondBuffer.duration
    const secondExpectedSamples = Math.round(secondBuffer.length * ASSESSMENT_AUDIO_SAMPLE_RATE / secondBuffer.sampleRate)
    if (!Number.isFinite(secondDuration) || secondDuration <= 0 || secondDuration > remainingSecondDuration + MAX_ENCODER_OVERSHOOT_SECONDS) {
      throw new AudioCompositionError('duration', 'The combined readings exceed the allowed duration. Re-record a shorter reading.')
    }
    if (secondExpectedSamples <= 0) {
      throw new AudioCompositionError('empty', 'Reading 2 contains no usable audio.')
    }

    const secondSamples = resampleChannelsToMono(
      audioBufferChannels(secondBuffer),
      secondBuffer.sampleRate,
      ASSESSMENT_AUDIO_SAMPLE_RATE,
      remainingSecondSamples,
    )
    const combinedSamples = joinMonoReadingsWithSilence(
      [firstSamples, secondSamples],
      ASSESSMENT_AUDIO_SAMPLE_RATE,
      READING_SEPARATION_SECONDS,
      maxOutputSamples,
    )
    const durationSeconds = combinedSamples.length / ASSESSMENT_AUDIO_SAMPLE_RATE
    validateCombinedAudioDuration(durationSeconds, limits)
    const wavBytes = WAV_HEADER_BYTES + combinedSamples.length * 2
    if (wavBytes > limits.maxBytes) {
      throw new AudioCompositionError('bytes', 'The combined readings exceed the allowed file size.')
    }

    return {
      audio: encodeMonoPcm16Wav(combinedSamples),
      durationSeconds,
    }
  } catch (error) {
    if (error instanceof AudioCompositionError) throw error
    throw new AudioCompositionError('decode', 'The browser could not combine the readings. Your recordings are still saved; try recording the affected reading again.')
  } finally {
    if (context && context.state !== 'closed') {
      try {
        await context.close()
      } catch {
        // AudioContext cleanup must not replace the composition result or error.
      }
    }
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init)

  if (!response.ok) {
    let body: { error?: { code?: string; message?: string } } | undefined
    try {
      body = await response.json() as { error?: { code?: string; message?: string } }
    } catch {
      // A non-JSON error still receives a safe, useful message below.
    }
    throw new ApiError(
      body?.error?.message || 'The request could not be completed. Please try again.',
      response.status,
      body?.error?.code,
    )
  }

  if (response.status === 204) return undefined as T
  return await response.json() as T
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export function getPublicLink(token: string): Promise<PublicLink> {
  return request(`/public/links/${encodeURIComponent(token)}`)
}

export function submitPublicAssessment(
  linkToken: string,
  body: {
    learnerReference: string
    email?: string
    consentVersion: string
    audio: Blob
  },
  idempotencyKey: string,
): Promise<AssessmentSubmissionResponse> {
  const form = new FormData()
  form.append('learner_reference', body.learnerReference)
  if (body.email) form.append('email', body.email)
  form.append('consent', 'true')
  form.append('consent_version', body.consentVersion)
  form.append('audio', body.audio, audioFilename(body.audio))

  return request(`/public/links/${encodeURIComponent(linkToken)}/assessments`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: form,
  })
}

export function audioFilename(audio: Blob): string {
  const mediaType = audio.type.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType === 'audio/mpeg') return 'recording.mp3'
  if (mediaType === 'video/quicktime') return 'recording.mov'
  const extension = mediaType === 'audio/mp4' || mediaType === 'video/mp4'
    ? 'mp4'
    : mediaType === 'audio/ogg'
      ? 'ogg'
      : mediaType === 'audio/wav' || mediaType === 'audio/x-wav'
        ? 'wav'
        : 'webm'
  return `recording.${extension}`
}

export function getAssessmentStatus(assessmentId: string, token: string): Promise<AssessmentStatus> {
  return request(`/public/assessments/${encodeURIComponent(assessmentId)}/status`, {
    headers: bearer(token),
  })
}

export function getStudentReport(token: string): Promise<StudentReport> {
  return request(`/public/reports/${encodeURIComponent(token)}`)
}

export function studentReportPdfUrl(token: string): string {
  return apiUrl(`/public/reports/${encodeURIComponent(token)}/pdf`)
}

export function saveReportSession(session: SavedReportSession): void {
  try {
    sessionStorage.setItem(`vitone:report:${session.assessmentToken}`, JSON.stringify(session))
  } catch {
    // The assessment token and report details are still held in route state for this visit.
  }
}

export function readReportSession(token: string): SavedReportSession | null {
  try {
    const value = sessionStorage.getItem(`vitone:report:${token}`)
    if (!value) return null
    const saved = JSON.parse(value) as Partial<SavedReportSession>
    if (!saved.assessmentId || !saved.assessmentToken || !saved.passageTitle) return null
    return {
      assessmentId: saved.assessmentId,
      assessmentToken: saved.assessmentToken,
      passageTitle: saved.passageTitle,
    }
  } catch {
    return null
  }
}
