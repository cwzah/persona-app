import { useState, useRef, useEffect } from 'react';

function encodePersona(persona) {
  return btoa(encodeURIComponent(JSON.stringify(persona)));
}

function decodePersona(encoded) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [persona, setPersona] = useState(null);
  const [shareUrl, setShareUrl] = useState('');
  const [displayMessages, setDisplayMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [voices, setVoices] = useState([]);
  
  // Use ref for conversation history to avoid state timing issues
  const conversationRef = useRef([]);
  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      if (synthRef.current) {
        const availableVoices = synthRef.current.getVoices();
        setVoices(availableVoices);
        
        // Find best voice - prefer Australian, then other English natural voices
        const ausVoice = availableVoices.find(v => 
          v.lang === 'en-AU' && (v.name.includes('Karen') || v.name.includes('Gordon') || v.name.includes('Catherine'))
        );
        const naturalVoice = availableVoices.find(v => 
          v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Premium')
        );
        const englishVoice = availableVoices.find(v => 
          v.lang.startsWith('en') && !v.name.includes('India') && !v.name.includes('Singapore')
        );
        
        setSelectedVoice(ausVoice || naturalVoice || englishVoice || availableVoices[0]);
      }
    };

    loadVoices();
    if (synthRef.current) {
      synthRef.current.onvoiceschanged = loadVoices;
    }
  }, []);

  // Check URL for persona on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('p');
    if (encoded) {
      const decoded = decodePersona(encoded);
      if (decoded) {
        setPersona(decoded);
        setScreen('chat');
      }
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-AU';

      recognitionRef.current.onresult = (event) => {
        let final = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setTranscript(final || interim);
      };

      recognitionRef.current.onend = () => setIsListening(false);
      recognitionRef.current.onerror = () => setIsListening(false);
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const speak = (text) => {
    return new Promise((resolve) => {
      if (!synthRef.current) {
        resolve();
        return;
      }

      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };

      synthRef.current.speak(utterance);
    });
  };

  const startListening = async () => {
    if (!recognitionRef.current || isListening || isSpeaking) return;
    
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setTranscript('');
      setIsListening(true);
      recognitionRef.current.start();
    } catch (e) {
      alert('Microphone access required');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const startOnboarding = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert('Microphone access required');
      return;
    }

    // Reset conversation
    conversationRef.current = [{ role: 'user', content: 'Hi, I want to create my AI persona.' }];
    
    setScreen('onboarding');
    setDisplayMessages([]);
    setIsLoading(true);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You're having a casual voice chat to learn about someone. Keep it natural and conversational.

CRITICAL: Give SHORT replies only - one sentence, max two. This is spoken aloud.

Ask ONE thing at a time. Across 6-8 back-and-forths, learn:
- Their name and work
- Where they're from  
- What excites them
- A good story from their life
- Something they believe strongly
- How friends would describe them

When done (after 6-8 exchanges), add [READY] at the end.

Start casually - ask their name.`,
          messages: conversationRef.current
        })
      });
      
      const data = await response.json();
      const text = data.content?.[0]?.text || "Hey there! What's your name?";
      const cleanText = text.replace('[READY]', '').trim();
      
      // Add to conversation ref
      conversationRef.current.push({ role: 'assistant', content: cleanText });
      setDisplayMessages([{ role: 'assistant', content: cleanText }]);
      setIsLoading(false);
      await speak(cleanText);
      
    } catch (error) {
      const fallback = "Hey! What's your name?";
      conversationRef.current.push({ role: 'assistant', content: fallback });
      setDisplayMessages([{ role: 'assistant', content: fallback }]);
      setIsLoading(false);
      await speak(fallback);
    }
  };

  const sendMessage = async () => {
    if (!transcript.trim() || isLoading || isSpeaking) return;
    
    const userMessage = transcript.trim();
    setTranscript('');
    
    // Add user message to conversation
    conversationRef.current.push({ role: 'user', content: userMessage });
    setDisplayMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const systemPrompt = screen === 'onboarding' 
      ? `You're having a casual voice chat to learn about someone. Keep it natural and conversational.

CRITICAL: Give SHORT replies only - one sentence, max two. This is spoken aloud.

Ask ONE thing at a time. Across 6-8 back-and-forths, learn:
- Their name and work
- Where they're from  
- What excites them
- A good story from their life
- Something they believe strongly
- How friends would describe them

When done (after 6-8 exchanges), add [READY] at the end.`
      : `You ARE ${persona.name}. Speak as them naturally. Keep responses brief - this is voice.

${persona.tagline}
Background: ${persona.background}
Passions: ${persona.passions?.join(', ')}
Personality: ${persona.personality}
Style: ${persona.style}

Never mention being an AI.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: conversationRef.current
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "Tell me more.";
      const cleanText = text.replace('[READY]', '').trim();
      
      // Add assistant response to conversation
      conversationRef.current.push({ role: 'assistant', content: cleanText });
      setDisplayMessages(prev => [...prev, { role: 'assistant', content: cleanText }]);
      setIsLoading(false);

      if (text.includes('[READY]')) {
        setOnboardingComplete(true);
        await speak(cleanText);
        generatePersona();
      } else {
        await speak(cleanText);
      }
    } catch (error) {
      const fallback = "Sorry, say that again?";
      conversationRef.current.push({ role: 'assistant', content: fallback });
      setDisplayMessages(prev => [...prev, { role: 'assistant', content: fallback }]);
      setIsLoading(false);
      await speak(fallback);
    }
  };

  const generatePersona = async () => {
    setIsLoading(true);
    await speak("Great chat! Building your AI now...");
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: `Create a persona from this conversation. Return ONLY JSON:
{
  "name": "name",
  "tagline": "one line description",
  "background": "background",
  "passions": ["list"],
  "personality": "personality",
  "stories": ["stories"],
  "perspectives": ["views"],
  "style": "communication style"
}`,
          messages: [...conversationRef.current, { role: 'user', content: 'Create my persona.' }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const personaData = JSON.parse(jsonMatch[0]);
        const encoded = encodePersona(personaData);
        const url = `${window.location.origin}${window.location.pathname}?p=${encoded}`;
        
        setPersona(personaData);
        setShareUrl(url);
        setScreen('complete');
      }
    } catch (error) {
      console.error('Error:', error);
    }
    setIsLoading(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    alert('Link copied!');
  };

  const startChat = () => {
    conversationRef.current = [];
    setDisplayMessages([]);
    setScreen('chat');
  };

  const exitToLanding = () => {
    synthRef.current?.cancel();
    window.history.pushState({}, '', window.location.pathname);
    conversationRef.current = [];
    setScreen('landing');
    setDisplayMessages([]);
    setPersona(null);
    setOnboardingComplete(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)',
      fontFamily: "'Crimson Pro', Georgia, serif",
      color: '#e8e6e3'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;500&family=Space+Mono&display=swap');
        * { box-sizing: border-box; }
        
        .btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border: none;
          padding: 16px 32px;
          color: white;
          font-family: 'Space Mono', monospace;
          font-size: 14px;
          cursor: pointer;
          text-transform: uppercase;
          border-radius: 8px;
        }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.3);
        }
        
        .mic {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          font-size: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .mic.active {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }
          50% { box-shadow: 0 0 0 30px rgba(220, 38, 38, 0); }
        }
        
        .wave { display: flex; gap: 6px; align-items: center; height: 50px; }
        .wave span {
          width: 6px;
          background: #7c3aed;
          border-radius: 3px;
          animation: wave 0.5s ease-in-out infinite alternate;
        }
        .wave span:nth-child(1) { height: 15px; }
        .wave span:nth-child(2) { height: 30px; animation-delay: 0.1s; }
        .wave span:nth-child(3) { height: 45px; animation-delay: 0.2s; }
        .wave span:nth-child(4) { height: 30px; animation-delay: 0.3s; }
        .wave span:nth-child(5) { height: 15px; animation-delay: 0.4s; }
        @keyframes wave {
          to { transform: scaleY(1.5); }
        }
      `}</style>

      {/* Landing */}
      {screen === 'landing' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '4px', fontFamily: 'Space Mono', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>
            DIGITAL PERSONA
          </div>
          
          <h1 style={{ fontSize: 'clamp(40px, 10vw, 70px)', fontWeight: '300', margin: '0 0 20px', background: 'linear-gradient(135deg, #fff, rgba(255,255,255,0.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Your AI.<br/>Your Voice.
          </h1>
          
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.5)', maxWidth: '380px', marginBottom: '40px' }}>
            A quick voice chat creates an AI that speaks as you.
          </p>

          <button className="btn" onClick={startOnboarding}>
            🎤 Start Interview
          </button>
          
          {voices.length > 0 && (
            <div style={{ marginTop: '40px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
              Voice: {selectedVoice?.name || 'Default'}
            </div>
          )}
        </div>
      )}

      {/* Onboarding */}
      {screen === 'onboarding' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          
          <div style={{ fontSize: '11px', letterSpacing: '3px', fontFamily: 'Space Mono', color: isSpeaking ? '#7c3aed' : isListening ? '#dc2626' : 'rgba(255,255,255,0.4)', marginBottom: '24px' }}>
            {isSpeaking ? '🔊 SPEAKING' : isListening ? '🎤 LISTENING' : isLoading ? '⏳ THINKING' : '👆 TAP MIC'}
          </div>

          {isSpeaking && <div className="wave" style={{ marginBottom: '24px' }}><span/><span/><span/><span/><span/></div>}

          <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.8)', maxWidth: '450px', marginBottom: '32px', minHeight: '60px', lineHeight: 1.5 }}>
            {transcript || (displayMessages.length > 0 ? displayMessages[displayMessages.length - 1].content : '')}
          </div>

          {!onboardingComplete && (
            <>
              <button className={`btn mic ${isListening ? 'active' : ''}`} onClick={isListening ? stopListening : startListening} disabled={isSpeaking || isLoading}>
                🎤
              </button>
              
              {transcript && !isListening && (
                <button className="btn" onClick={sendMessage} disabled={isLoading || isSpeaking} style={{ marginTop: '20px' }}>
                  Send ➤
                </button>
              )}
            </>
          )}

          {onboardingComplete && (
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>Building your AI...</div>
          )}
        </div>
      )}

      {/* Complete */}
      {screen === 'complete' && persona && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '40px', maxWidth: '400px', width: '100%' }}>
            
            <div style={{ fontSize: '11px', letterSpacing: '3px', fontFamily: 'Space Mono', color: '#7c3aed', marginBottom: '12px' }}>
              ✓ CREATED
            </div>
            
            <h2 style={{ fontSize: '28px', fontWeight: '400', margin: '0 0 8px' }}>{persona.name}</h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: '0 0 28px' }}>{persona.tagline}</p>

            <button className="btn" onClick={copyLink} style={{ width: '100%', marginBottom: '10px' }}>
              📋 Copy Share Link
            </button>
            
            <button className="btn btn-outline" onClick={startChat} style={{ width: '100%', marginBottom: '20px' }}>
              🎤 Test It
            </button>

            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
              Anyone with the link can voice chat with your AI
            </p>
          </div>
        </div>
      )}

      {/* Chat */}
      {screen === 'chat' && persona && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          
          <button className="btn btn-outline" onClick={exitToLanding} style={{ position: 'fixed', top: '20px', right: '20px', padding: '8px 16px', fontSize: '11px' }}>
            Exit
          </button>

          <h2 style={{ fontSize: '22px', fontWeight: '400', margin: '0 0 4px' }}>{persona.name}</h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '24px' }}>{persona.tagline}</p>

          {isSpeaking && <div className="wave" style={{ marginBottom: '20px' }}><span/><span/><span/><span/><span/></div>}

          <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.8)', maxWidth: '400px', marginBottom: '28px', minHeight: '50px' }}>
            {transcript || (displayMessages.length > 0 ? displayMessages[displayMessages.length - 1].content : `Talk to ${persona.name}`)}
          </div>

          <button className={`btn mic ${isListening ? 'active' : ''}`} onClick={isListening ? stopListening : startListening} disabled={isSpeaking || isLoading}>
            🎤
          </button>
          
          {transcript && !isListening && (
            <button className="btn" onClick={sendMessage} disabled={isLoading || isSpeaking} style={{ marginTop: '20px' }}>
              Send ➤
            </button>
          )}
        </div>
      )}
    </div>
  );
}
