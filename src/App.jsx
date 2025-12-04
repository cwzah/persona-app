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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  
  const conversationRef = useRef([]);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const inputRef = useRef(null);

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      if (synthRef.current) {
        const allVoices = synthRef.current.getVoices();
        const englishVoices = allVoices.filter(v => v.lang.startsWith('en'));
        
        englishVoices.sort((a, b) => {
          const order = { 'en-AU': 0, 'en-GB': 1, 'en-US': 2 };
          return (order[a.lang] ?? 3) - (order[b.lang] ?? 3);
        });
        
        setVoices(englishVoices.length > 0 ? englishVoices : allVoices);
        
        const defaultIndex = englishVoices.findIndex(v => 
          v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen')
        );
        if (defaultIndex >= 0) setSelectedVoiceIndex(defaultIndex);
      }
    };

    loadVoices();
    if (synthRef.current) synthRef.current.onvoiceschanged = loadVoices;
  }, []);

  // Check URL for persona
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

  const speak = (text) => {
    return new Promise((resolve) => {
      if (!synthRef.current || voices.length === 0) {
        resolve();
        return;
      }

      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.voice = voices[selectedVoiceIndex];

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };

      synthRef.current.speak(utterance);
    });
  };

  const testVoice = () => {
    if (voices.length > 0) {
      synthRef.current?.cancel();
      const utterance = new SpeechSynthesisUtterance("G'day, how's it going?");
      utterance.voice = voices[selectedVoiceIndex];
      utterance.rate = 0.9;
      synthRef.current?.speak(utterance);
    }
  };

  const startOnboarding = async () => {
    conversationRef.current = [{ role: 'user', content: 'Hi, I want to create my AI persona.' }];
    setScreen('onboarding');
    setDisplayMessages([]);
    setTextInput('');
    setIsLoading(true);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You're having a casual chat to learn about someone. Keep it natural.

CRITICAL: One short sentence only. This will be spoken aloud.

Ask ONE thing at a time. Across 6-8 exchanges, learn:
- Their name and work
- Where they're from  
- What excites them
- A good story
- Something they believe strongly
- How friends describe them

After 6-8 exchanges, add [READY] at the end.

Start by asking their name.`,
          messages: conversationRef.current
        })
      });
      
      const data = await response.json();
      const text = data.content?.[0]?.text || "Hey! What's your name?";
      const cleanText = text.replace('[READY]', '').trim();
      
      conversationRef.current.push({ role: 'assistant', content: cleanText });
      setDisplayMessages([{ role: 'assistant', content: cleanText }]);
      setIsLoading(false);
      await speak(cleanText);
      inputRef.current?.focus();
      
    } catch (error) {
      const fallback = "Hey! What's your name?";
      conversationRef.current.push({ role: 'assistant', content: fallback });
      setDisplayMessages([{ role: 'assistant', content: fallback }]);
      setIsLoading(false);
      await speak(fallback);
    }
  };

  const sendMessage = async () => {
    if (!textInput.trim() || isLoading || isSpeaking) return;
    
    const userMessage = textInput.trim();
    setTextInput('');
    
    conversationRef.current.push({ role: 'user', content: userMessage });
    setDisplayMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const systemPrompt = screen === 'onboarding' 
      ? `You're having a casual chat to learn about someone. Keep it natural.

CRITICAL: One short sentence only. This will be spoken aloud.

Ask ONE thing at a time. Across 6-8 exchanges, learn:
- Their name and work
- Where they're from  
- What excites them
- A good story
- Something they believe strongly
- How friends describe them

After 6-8 exchanges, add [READY] at the end.`
      : `You ARE ${persona.name}. Speak as them. One or two sentences max.

${persona.tagline}
Background: ${persona.background}
Passions: ${persona.passions?.join(', ')}
Personality: ${persona.personality}

Never say you're an AI.`;

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
      
      conversationRef.current.push({ role: 'assistant', content: cleanText });
      setDisplayMessages(prev => [...prev, { role: 'assistant', content: cleanText }]);
      setIsLoading(false);

      if (text.includes('[READY]')) {
        setOnboardingComplete(true);
        await speak(cleanText);
        generatePersona();
      } else {
        await speak(cleanText);
        inputRef.current?.focus();
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
    await speak("Great! Building your AI now.");
    
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
  "tagline": "one line",
  "background": "background",
  "passions": ["list"],
  "personality": "personality",
  "stories": ["stories"],
  "perspectives": ["views"],
  "style": "how they talk"
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

  const exitToLanding = () => {
    synthRef.current?.cancel();
    window.history.pushState({}, '', window.location.pathname);
    conversationRef.current = [];
    setScreen('landing');
    setDisplayMessages([]);
    setPersona(null);
    setOnboardingComplete(false);
    setTextInput('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)',
      fontFamily: "system-ui, -apple-system, sans-serif",
      color: '#e8e6e3'
    }}>
      <style>{`
        * { box-sizing: border-box; }
        
        .btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border: none;
          padding: 14px 28px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
        }
        .btn:disabled { opacity: 0.5; }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.3);
        }
        .btn-sm { padding: 8px 16px; font-size: 12px; }
        
        .wave { display: flex; gap: 5px; align-items: center; height: 40px; }
        .wave span {
          width: 5px;
          background: #7c3aed;
          border-radius: 3px;
          animation: wave 0.5s ease-in-out infinite alternate;
        }
        .wave span:nth-child(1) { height: 12px; }
        .wave span:nth-child(2) { height: 24px; animation-delay: 0.1s; }
        .wave span:nth-child(3) { height: 36px; animation-delay: 0.2s; }
        .wave span:nth-child(4) { height: 24px; animation-delay: 0.3s; }
        .wave span:nth-child(5) { height: 12px; animation-delay: 0.4s; }
        @keyframes wave { to { transform: scaleY(1.4); } }
        
        select, input, textarea {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 16px;
          width: 100%;
        }
        select option { background: #1a1a2e; }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.4); }
        input:focus, textarea:focus { outline: none; border-color: #7c3aed; }
        
        .message { 
          padding: 12px 16px; 
          border-radius: 12px; 
          max-width: 85%;
          margin-bottom: 12px;
        }
        .message.user { 
          background: #4f46e5; 
          margin-left: auto;
          border-bottom-right-radius: 4px;
        }
        .message.assistant { 
          background: rgba(255,255,255,0.1);
          border-bottom-left-radius: 4px;
        }
      `}</style>

      {/* Landing */}
      {screen === 'landing' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          
          <h1 style={{ fontSize: 'clamp(32px, 8vw, 56px)', fontWeight: '300', margin: '0 0 16px', color: 'white' }}>
            Your AI. Your Voice.
          </h1>
          
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', maxWidth: '320px', marginBottom: '32px' }}>
            A quick chat creates an AI that represents you.
          </p>

          <button className="btn" onClick={startOnboarding} style={{ marginBottom: '32px' }}>
            Start Interview
          </button>
          
          {voices.length > 0 && (
            <div style={{ marginTop: '20px', maxWidth: '300px', width: '100%' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>
                AI voice:
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select 
                  value={selectedVoiceIndex} 
                  onChange={(e) => setSelectedVoiceIndex(Number(e.target.value))}
                  style={{ flex: 1 }}
                >
                  {voices.map((v, i) => (
                    <option key={i} value={i}>{v.name}</option>
                  ))}
                </select>
                <button className="btn btn-outline btn-sm" onClick={testVoice}>
                  Test
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onboarding */}
      {screen === 'onboarding' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
          
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px', textAlign: 'center' }}>
            {isLoading ? '⏳ Thinking...' : isSpeaking ? '🔊 Speaking...' : 'Type your response'}
          </div>

          {isSpeaking && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div className="wave"><span/><span/><span/><span/><span/></div>
            </div>
          )}

          {/* Chat history */}
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
            {displayMessages.filter((m, i) => !(i === 0 && m.role === 'user')).map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            
            {onboardingComplete && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '20px' }}>
                Building your AI...
              </div>
            )}
          </div>

          {/* Input */}
          {!onboardingComplete && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={inputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your answer..."
                disabled={isLoading || isSpeaking}
                style={{ flex: 1 }}
              />
              <button 
                className="btn" 
                onClick={sendMessage} 
                disabled={!textInput.trim() || isLoading || isSpeaking}
                style={{ padding: '12px 20px' }}
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}

      {/* Complete */}
      {screen === 'complete' && persona && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '36px', maxWidth: '380px', width: '100%' }}>
            
            <div style={{ fontSize: '11px', color: '#7c3aed', marginBottom: '12px', fontWeight: '600' }}>
              ✓ CREATED
            </div>
            
            <h2 style={{ fontSize: '26px', fontWeight: '400', margin: '0 0 8px' }}>{persona.name}</h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: '0 0 24px' }}>{persona.tagline}</p>

            <button className="btn" onClick={copyLink} style={{ width: '100%', marginBottom: '10px' }}>
              📋 Copy Share Link
            </button>
            
            <button className="btn btn-outline" onClick={() => { conversationRef.current = []; setDisplayMessages([]); setTextInput(''); setScreen('chat'); }} style={{ width: '100%' }}>
              💬 Test It
            </button>
          </div>
        </div>
      )}

      {/* Chat */}
      {screen === 'chat' && persona && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>{persona.name}</h2>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{persona.tagline}</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={exitToLanding}>Exit</button>
          </div>

          {isSpeaking && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <div className="wave"><span/><span/><span/><span/><span/></div>
            </div>
          )}

          {/* Chat history */}
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
            {displayMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '40px 20px' }}>
                Say hi to {persona.name}
              </div>
            )}
            {displayMessages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                {msg.content}
              </div>
            ))}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={inputRef}
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Message ${persona.name}...`}
              disabled={isLoading || isSpeaking}
              style={{ flex: 1 }}
            />
            <button 
              className="btn" 
              onClick={sendMessage} 
              disabled={!textInput.trim() || isLoading || isSpeaking}
              style={{ padding: '12px 20px' }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
