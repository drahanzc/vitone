import { Mascot } from './StudentChrome'

const waveformHeights = [7.2, 14.4, 21.6, 10.8, 18, 25.2, 12.6, 19.8, 9, 16.2, 23.4, 10.8, 7.2]

function SpeechBubble() {
  return (
    <div className="home-illustration-bubble">
      <div className="home-illustration-bubble-heading"><span className="home-illustration-mic"><img src="/assets/student-assessment-microphone.svg" alt="" /></span><span>You · 2:34</span></div>
      <div className="home-illustration-wave">{waveformHeights.map((height, index) => <span key={index} style={{ height: `${height / 25.2 * 100}%` }} />)}</div>
    </div>
  )
}

function SpeakingCard() {
  return (
    <div className="home-illustration-note">
      <div className="home-illustration-note-heading"><span>Speaking</span><span className="home-illustration-sparkle">✦</span></div>
      <div className="home-illustration-lines"><span /><span /><span /></div>
    </div>
  )
}

export function HomeIllustration() {
  return (
    <div className="home-art" aria-hidden="true">
      <div className="home-illustration-halo" />
      <img className="home-illustration-path" src="/assets/home-voice-path.svg" alt="" />
      <div className="home-illustration-mascot"><Mascot /></div>
      <img className="home-sparkle home-sparkle-left" src="/assets/home-sparkle.svg" alt="" />
      <img className="home-sparkle home-sparkle-small" src="/assets/home-sparkle.svg" alt="" />
      <img className="home-sparkle home-sparkle-large" src="/assets/home-sparkle.svg" alt="" />
      <SpeechBubble />
      <SpeakingCard />
    </div>
  )
}
