import { useEffect, useState } from "react";

import { HeroConnectIllustration } from "./HeroConnectIllustration";

type ViewState = {
  filePath: string;
  storedAuth: Record<string, unknown> | null;
};

type ProviderId = "chatgpt" | "copilot" | "gemini";

type Provider = {
  id: ProviderId;
  title: string;
  subtitle: string;
};

const providers: Provider[] = [
  {
    id: "chatgpt",
    title: "ChatGPT",
    subtitle: "connect your ChatGPT account",
  },
  {
    id: "copilot",
    title: "Copilot",
    subtitle: "connect your Copilot account",
  },
  {
    id: "gemini",
    title: "Gemini",
    subtitle: "connect your Gemini account",
  },
];

function ChatGPTMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid"
      viewBox="0 0 256 260"
    >
      <path
        fill="currentColor"
        d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"
      />
    </svg>
  );
}

function CopilotMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid"
      viewBox="0 0 256 208"
    >
      <path
        fill="currentColor"
        d="M205.3 31.4c14 14.8 20 35.2 22.5 63.6 6.6 0 12.8 1.5 17 7.2l7.8 10.6c2.2 3 3.4 6.6 3.4 10.4v28.7a12 12 0 0 1-4.8 9.5C215.9 187.2 172.3 208 128 208c-49 0-98.2-28.3-123.2-46.6a12 12 0 0 1-4.8-9.5v-28.7c0-3.8 1.2-7.4 3.4-10.5l7.8-10.5c4.2-5.7 10.4-7.2 17-7.2 2.5-28.4 8.4-48.8 22.5-63.6C77.3 3.2 112.6 0 127.6 0h.4c14.7 0 50.4 2.9 77.3 31.4ZM128 78.7c-3 0-6.5.2-10.3.6a27.1 27.1 0 0 1-6 12.1 45 45 0 0 1-32 13c-6.8 0-13.9-1.5-19.7-5.2-5.5 1.9-10.8 4.5-11.2 11-.5 12.2-.6 24.5-.6 36.8 0 6.1 0 12.3-.2 18.5 0 3.6 2.2 6.9 5.5 8.4C79.9 185.9 105 192 128 192s48-6 74.5-18.1a9.4 9.4 0 0 0 5.5-8.4c.3-18.4 0-37-.8-55.3-.4-6.6-5.7-9.1-11.2-11-5.8 3.7-13 5.1-19.7 5.1a45 45 0 0 1-32-12.9 27.1 27.1 0 0 1-6-12.1c-3.4-.4-6.9-.5-10.3-.6Zm-27 44c5.8 0 10.5 4.6 10.5 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.6-10.4 10.4-10.4Zm53.4 0c5.8 0 10.4 4.6 10.4 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.7-10.4 10.4-10.4Zm-73-94.4c-11.2 1.1-20.6 4.8-25.4 10-10.4 11.3-8.2 40.1-2.2 46.2A31.2 31.2 0 0 0 75 91.7c6.8 0 19.6-1.5 30.1-12.2 4.7-4.5 7.5-15.7 7.2-27-.3-9.1-2.9-16.7-6.7-19.9-4.2-3.6-13.6-5.2-24.2-4.3Zm69 4.3c-3.8 3.2-6.4 10.8-6.7 19.9-.3 11.3 2.5 22.5 7.2 27a41.7 41.7 0 0 0 30 12.2c8.9 0 17-2.9 21.3-7.2 6-6.1 8.2-34.9-2.2-46.3-4.8-5-14.2-8.8-25.4-9.9-10.6-1-20 .7-24.2 4.3ZM128 56c-2.6 0-5.6.2-9 .5.4 1.7.5 3.7.7 5.7 0 1.5 0 3-.2 4.5 3.2-.3 6-.3 8.5-.3 2.6 0 5.3 0 8.5.3-.2-1.6-.2-3-.2-4.5.2-2 .3-4 .7-5.7-3.4-.3-6.4-.5-9-.5Z"
      />
    </svg>
  );
}

function GeminiMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 296 298"
    >
      <mask
        id="gemini__a"
        width="296"
        height="298"
        x="0"
        y="0"
        maskUnits="userSpaceOnUse"
        style={{ maskType: "alpha" }}
      >
        <path
          fill="white"
          d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z"
        />
      </mask>
      <g mask="url(#gemini__a)">
        <g filter="url(#gemini__b)">
          <ellipse cx="163" cy="149" fill="currentColor" rx="196" ry="159" />
        </g>
        <g filter="url(#gemini__c)">
          <ellipse cx="33.5" cy="142.5" fill="currentColor" rx="68.5" ry="72.5" />
        </g>
        <g filter="url(#gemini__d)">
          <ellipse cx="19.5" cy="148.5" fill="currentColor" rx="68.5" ry="72.5" />
        </g>
        <g filter="url(#gemini__e)">
          <path
            fill="currentColor"
            d="M194 10.5C172 82.5 65.5 134.333 22.5 135L144-66l50 76.5Z"
          />
        </g>
        <g filter="url(#gemini__f)">
          <path
            fill="currentColor"
            d="M190.5-12.5C168.5 59.5 62 111.333 19 112L140.5-89l50 76.5Z"
          />
        </g>
        <g filter="url(#gemini__g)">
          <path
            fill="currentColor"
            d="M194.5 279.5C172.5 207.5 66 155.667 23 155l121.5 201 50-76.5Z"
          />
        </g>
        <g filter="url(#gemini__h)">
          <path
            fill="currentColor"
            d="M196.5 320.5C174.5 248.5 68 196.667 25 196l121.5 201 50-76.5Z"
          />
        </g>
      </g>
      <defs>
        <filter
          id="gemini__b"
          width="464"
          height="390"
          x="-69"
          y="-46"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="18" />
        </filter>
        <filter
          id="gemini__c"
          width="265"
          height="273"
          x="-99"
          y="6"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
        </filter>
        <filter
          id="gemini__d"
          width="265"
          height="273"
          x="-113"
          y="12"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
        </filter>
        <filter
          id="gemini__e"
          width="299.5"
          height="329"
          x="-41.5"
          y="-130"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
        </filter>
        <filter
          id="gemini__f"
          width="299.5"
          height="329"
          x="-45"
          y="-153"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
        </filter>
        <filter
          id="gemini__g"
          width="299.5"
          height="329"
          x="-41"
          y="91"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
        </filter>
        <filter
          id="gemini__h"
          width="299.5"
          height="329"
          x="-39"
          y="132"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
        </filter>
      </defs>
    </svg>
  );
}

function ProviderIcon({
  id,
  className = "",
}: { id: ProviderId; className?: string }) {
  if (id === "chatgpt") {
    return <ChatGPTMark className={className} />;
  }

  if (id === "copilot") {
    return <CopilotMark className={className} />;
  }

  return <GeminiMark className={className} />;
}

function App() {
  const [isChatGPTLoading, setIsChatGPTLoading] = useState(false);
  const [isChatGPTConnected, setIsChatGPTConnected] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("chatgpt");
  const [_viewState, setViewState] = useState<ViewState>({
    filePath: "",
    storedAuth: null,
  });

  useEffect(() => {
    void window.electronAPI.getHaxAuth().then((result) => {
      setViewState({
        filePath: result.filePath,
        storedAuth: result.storedAuth,
      });
    });
  }, []);

  const handleChatGPTSignIn = async () => {
    setIsChatGPTLoading(true);

    try {
      const result = await window.electronAPI.signInWithChatGPT();
      if (result.ok) {
        setIsChatGPTConnected(true);
      }
    } finally {
      setIsChatGPTLoading(false);
    }
  };

  const activeProvider =
    providers.find((provider) => provider.id === selectedProvider) ?? providers[0];

  return (
    <main className="min-h-screen w-full bg-[#08090A] text-white font-sans overflow-hidden flex">
      {/* Sidebar */}
      <div className="fixed left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 p-2.5 rounded-[2rem] bg-white/[0.03] border border-white/[0.05] backdrop-blur-md">
        {providers.map((provider) => {
          const isActive = provider.id === selectedProvider;
          return (
            <button
              key={provider.id}
              onClick={() => setSelectedProvider(provider.id)}
              className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center ${
                isActive
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              }`}
            >
              <ProviderIcon id={provider.id} className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-32 flex min-h-screen flex-col">
        <div className="flex shrink-0 items-start justify-between px-16 pt-16">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-white/90">
              {activeProvider.title}
            </h1>
            <p className="mt-2 text-[15px] text-white/40">
              {activeProvider.subtitle}
            </p>
          </div>

          <button
            onClick={activeProvider.id === "chatgpt" ? handleChatGPTSignIn : undefined}
            disabled={activeProvider.id === "chatgpt" && (isChatGPTLoading || isChatGPTConnected)}
            className="px-6 py-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[14px] font-medium text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {activeProvider.id === "chatgpt" && isChatGPTConnected
              ? "Connected"
              : activeProvider.id === "chatgpt" && isChatGPTLoading
                ? "Connecting..."
                : "Connect"}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-end pr-0 pl-8 pb-12 pt-8">
          <HeroConnectIllustration className="h-[min(52vh,560px)] w-auto max-h-full max-w-none select-none [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-none [&_svg]:object-contain [&_svg]:object-right" />
        </div>
      </div>
    </main>
  );
}

export default App;
