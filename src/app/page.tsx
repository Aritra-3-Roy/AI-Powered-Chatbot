"use client";
import DOMPurify from "dompurify";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SendHorizonal, Upload, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";

// @ts-ignore - global from CDN
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface Message {
  id: string;
  role: "user" | "ai" | "file";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

const toContents = (messages: Message[]) => {
  return messages
    .filter((msg) => msg.role !== "file")
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));
};

export default function ChatbotPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfText, setPdfText] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (sessions.length === 0) {
      handleNewChat();
    }
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSessionId, isTyping]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    };
    document.body.appendChild(script);
  }, []);

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: "New Chat",
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handleSend = async () => {
    if (!input.trim() && !pdfText) return;

    const sessionId = activeSessionId;
    if (!sessionId) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: input.trim(),
    };

    const newTitle = input.trim().slice(0, 20) || "New Chat";

    const updatedSessions = sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            messages: [...s.messages, userMessage],
            title: s.messages.length === 0 ? newTitle : s.title,
          }
        : s
    );

    setSessions(updatedSessions);
    setInput("");
    setIsTyping(true);
    setError(null);

    const currentSession = updatedSessions.find((s) => s.id === sessionId);
    if (!currentSession) return;

    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_GEMINI_API_URL}`;

      const fullContent = [
        input.trim(),
        ...(pdfText ? [`PDF Content:\n${pdfText}`] : []),
      ].join("\n\n");

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            ...toContents(currentSession.messages),
            {
              role: "user",
              parts: [{ text: fullContent }],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();
      const aiText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "Sorry, I couldn't process that request.";

      const formattedAiText = formatResponse(aiText);

      const aiMessage: Message = {
        id: uuidv4(),
        role: "ai",
        content: formattedAiText,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, aiMessage] }
            : s
        )
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "An unknown error occurred";
      const errorMessage: Message = {
        id: uuidv4(),
        role: "ai",
        content: `Error: ${errorMsg}`,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, errorMessage] }
            : s
        )
      );
      setError(errorMsg);
    } finally {
      setIsTyping(false);
      setPdfText("");
    }
  };

  const formatResponse = (text: string): string => {
    let formatted = text.replace(/^\*\*(.*?)\*\*/gm, "<strong>$1</strong>");
    formatted = formatted.replace(/^\d+\.\s+(.*$)/gm, "<br/>$&");
    formatted = formatted.replace(/^\*\s+(.*$)/gm, "<br/>• $1");
    formatted = formatted.replace(/\n\n/g, "<br/><br/>");
    formatted = formatted.replace(/\n(?!\n)/g, " ");
    formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");
    return DOMPurify.sanitize(formatted);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") return;

    const sessionId = activeSessionId;
    if (!sessionId) return;

    const reader = new FileReader();
    reader.onload = async function () {
      const typedArray = new Uint8Array(this.result as ArrayBuffer);

      try {
        const pdf = await window.pdfjsLib.getDocument(typedArray).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(" ");
          text += `\n\n${pageText}`;
        }

        const fileMessage: Message = {
          id: uuidv4(),
          role: "file",
          content: `📄 File uploaded: ${file.name}`,
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, messages: [...s.messages, fileMessage] }
              : s
          )
        );

        setPdfText(text);
      } catch (err) {
        console.error("Failed to parse PDF:", err);
        setError("Failed to process PDF file.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(filtered[0]?.id || null);
      }
      return filtered;
    });
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <motion.div
        initial={{ x: -100 }}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 100 }}
        className="w-56 border-r p-2 bg-muted space-y-2 h-full"
      >
        <div className="text-center mb-2 space-y-2">
          <h2 className="text-lg font-semibold">Chats</h2>
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={handleNewChat}
          >
            + New Chat
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-100px)] pr-1">
          <div className="space-y-1">
            {sessions.map((session) => (
              <motion.div
                key={session.id}
                whileHover={{ scale: 1.02 }}
                className="relative group"
              >
                <Card
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    "cursor-pointer p-1 hover:bg-accent w-full",
                    session.id === activeSessionId &&
                      "bg-primary text-primary-foreground"
                  )}
                >
                  <CardContent className="p-1 text-xs truncate text-center">
                    {session.title}
                  </CardContent>
                </Card>
                <button
                  onClick={() => handleDeleteSession(session.id)}
                  className="flex items-center justify-center w-8 h-8 mx-auto mt-1 text-white hover:text-shadow-white text-xl"
                  title="Delete"
                >
                  <X className="w-6 h-6" />
                </button>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </motion.div>

      {/* Main */}
      <div className="flex flex-col flex-1 h-full bg-background">
        <div className="flex flex-col items-center px-2 py-2 border-b">
          <h1 className="text-2xl md:text-6xl font-extrabold mb-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            AI Chatbot
          </h1>
          {error && (
            <div className="text-red-500 text-sm bg-red-50 px-2 py-1 rounded">
              {error}
            </div>
          )}
        </div>


        <div className="w-full flex justify-center py-4 border-b bg-background">
  <div className="flex gap-6 max-w-5xl w-full px-4">
    {[1, 2, 3].map((n) => (
      <Card
        key={n}
        className="flex-1 min-w-[240px] max-w-[320px] shadow-2xl" // Larger card and stronger shadow
        style={{ fontFamily: "'Segoe UI', 'Arial', sans-serif" }}
      >
        <CardHeader className="pb-4">
          <CardTitle
            className="text-lg md:text-xl font-extrabold"
            style={{ fontFamily: "'Segoe UI', 'Arial', sans-serif" }}
          >
            Feature {n}
          </CardTitle>
          <CardDescription
            className="text-sm md:text-base font-bold"
            style={{ fontFamily: "'Segoe UI', 'Arial', sans-serif" }}
          >
            This chatbot demonstrates feature {n}. Interact with AI
            instantly with an intuitive and responsive interface.
          </CardDescription>
        </CardHeader>
      </Card>
    ))}
  </div>
</div>

        {/* Chat */}
    <div className="flex-1 flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 px-2 py-2 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {activeSessionId &&
              sessions
                .find((s) => s.id === activeSessionId)
                ?.messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "max-w-lg p-2 rounded-md text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground self-end"
                        : msg.role === "ai"
                        ? "bg-secondary text-secondary-foreground self-start"
                        : "bg-accent text-accent-foreground self-start"
                    )}
                    dangerouslySetInnerHTML={{ __html: msg.content }}
                  />
                ))}
            {isTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-secondary text-secondary-foreground px-3 py-1 rounded-md self-start max-w-lg text-lg"
              >
                <span className="animate-pulse">AI is typing...</span>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>
      </ScrollArea> 

          {/* Input */}
          <div className="w-full border-t bg-background px-2 py-2 sticky bottom-0">
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type your message..."
                className="h-14 text-base justify-center" // Increased height, decreased width, larger text
              />

              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                className="hidden"
                ref={fileInputRef}
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload">
                <Button variant="outline" size="sm" className="px-2" asChild>
                  <div>
                    <Upload className="h-4 w-4" />
                  </div>
                </Button>
              </label>
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                size="sm"
                className="px-2"
              >
                <SendHorizonal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
