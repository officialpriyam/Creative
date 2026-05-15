"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { appConfig } from "@/config/app.config";
import { Connector } from "@/components/shared/layout/curvy-rect";
import HeroFlame from "@/components/shared/effects/flame/hero-flame";
import AsciiExplosion from "@/components/shared/effects/flame/ascii-explosion";
import { HeaderProvider } from "@/components/shared/header/HeaderContext";
import HomeHeroBackground from "@/components/app/(home)/sections/hero/Background/Background";
import { BackgroundOuterPiece } from "@/components/app/(home)/sections/hero/Background/BackgroundOuterPiece";
import HomeHeroBadge from "@/components/app/(home)/sections/hero/Badge/Badge";
import HomeHeroPixi from "@/components/app/(home)/sections/hero/Pixi/Pixi";
import HomeHeroTitle from "@/components/app/(home)/sections/hero/Title/Title";
import HeroInputSubmitButton from "@/components/app/(home)/sections/hero-input/Button/Button";
import HeaderBrandKit from "@/components/shared/header/BrandKit/BrandKit";
import HeaderWrapper from "@/components/shared/header/Wrapper/Wrapper";
import HeaderDropdownWrapper from "@/components/shared/header/Dropdown/Wrapper/Wrapper";
import GithubIcon from "@/components/shared/header/Github/_svg/GithubIcon";
import ButtonUI from "@/components/ui/shadcn/button";

const urlPattern = /(https?:\/\/[^\s]+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/;

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [referenceImageName, setReferenceImageName] = useState("");
  const [selectedModel, setSelectedModel] = useState(appConfig.ai.defaultModel);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const router = useRouter();

  const detectedUrl = useMemo(() => {
    const match = prompt.match(urlPattern);
    return match?.[0] || "";
  }, [prompt]);

  const hasPrompt = prompt.trim().length > 0;
  const activeUrl = (siteUrl || detectedUrl).trim();

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a PNG, JPG, or WebP image.");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error("Please keep reference images under 3 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImage(String(reader.result || ""));
      setReferenceImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const rawPrompt = prompt.trim();
    if (!rawPrompt) {
      toast.error("Describe the app you want to build.");
      return;
    }

    setIsOptimizing(true);
    try {
      const response = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rawPrompt,
          siteUrl: activeUrl,
          image: referenceImage,
          imageName: referenceImageName,
          model: selectedModel,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Prompt optimization failed");
      }

      sessionStorage.setItem("creativePrompt", rawPrompt);
      sessionStorage.setItem("optimizedPrompt", data.optimizedPrompt || rawPrompt);
      sessionStorage.setItem("selectedModel", selectedModel);
      sessionStorage.setItem("autoStart", "true");

      if (activeUrl) {
        sessionStorage.setItem("targetUrl", activeUrl);
        sessionStorage.setItem("additionalInstructions", data.optimizedPrompt || rawPrompt);
      } else {
        sessionStorage.removeItem("targetUrl");
        sessionStorage.removeItem("additionalInstructions");
      }

      if (referenceImage) {
        sessionStorage.setItem("referenceImage", referenceImage);
        sessionStorage.setItem("referenceImageName", referenceImageName);
      } else {
        sessionStorage.removeItem("referenceImage");
        sessionStorage.removeItem("referenceImageName");
      }

      router.push("/generation");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start generation");
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <HeaderProvider>
      <div className="min-h-screen bg-background-base">
        <HeaderDropdownWrapper />

        <div className="sticky top-0 left-0 w-full z-[101] bg-background-base header">
          <div className="absolute top-0 cmw-container border-x border-border-faint h-full pointer-events-none" />
          <div className="h-1 bg-border-faint w-full left-0 -bottom-1 absolute" />
          <div className="cmw-container absolute h-full pointer-events-none top-0">
            <Connector className="absolute -left-[10.5px] -bottom-11" />
            <Connector className="absolute -right-[10.5px] -bottom-11" />
          </div>

          <HeaderWrapper>
            <div className="max-w-[900px] mx-auto w-full flex justify-between items-center">
              <HeaderBrandKit />
              <a
                className="contents"
                href="https://github.com/priyx/creative"
                target="_blank"
              >
                <ButtonUI variant="tertiary">
                  <GithubIcon />
                  Use this Template
                </ButtonUI>
              </a>
            </div>
          </HeaderWrapper>
        </div>

        <section className="overflow-x-clip" id="home-hero">
          <div className="pt-28 lg:pt-254 lg:-mt-100 pb-115 relative" id="hero-content">
            <HomeHeroPixi />
            <HeroFlame />
            <BackgroundOuterPiece />
            <HomeHeroBackground />

            <div className="relative container px-16">
              <HomeHeroBadge />
              <HomeHeroTitle />
              <p className="text-center text-body-large">
                Describe an app, attach a reference, or add a site link.
              </p>
            </div>
          </div>

          <div className="container lg:contents !p-16 relative -mt-90">
            <div className="absolute top-0 left-[calc(50%-50vw)] w-screen h-1 bg-border-faint lg:hidden" />
            <div className="absolute bottom-0 left-[calc(50%-50vw)] w-screen h-1 bg-border-faint lg:hidden" />
            <Connector className="-top-10 -left-[10.5px] lg:hidden" />
            <Connector className="-top-10 -right-[10.5px] lg:hidden" />
            <Connector className="-bottom-10 -left-[10.5px] lg:hidden" />
            <Connector className="-bottom-10 -right-[10.5px] lg:hidden" />

            <form onSubmit={handleSubmit} className="max-w-720 mx-auto z-[11] lg:z-[2]">
              <div className="rounded-20 -mt-30 lg:-mt-30 relative">
                <div
                  className="bg-white rounded-20 relative z-10 overflow-hidden"
                  style={{
                    boxShadow:
                      "0px 0px 44px 0px rgba(0, 0, 0, 0.02), 0px 88px 56px -20px rgba(0, 0, 0, 0.03), 0px 56px 56px -20px rgba(0, 0, 0, 0.02), 0px 32px 32px -20px rgba(0, 0, 0, 0.03), 0px 16px 24px -12px rgba(0, 0, 0, 0.03), 0px 0px 0px 1px rgba(0, 0, 0, 0.05), 0px 0px 0px 10px #F9F9F9",
                  }}
                >
                  <div className="p-24 border-b border-black-alpha-5">
                    <textarea
                      className="w-full min-h-132 resize-none bg-transparent text-[18px] leading-7 text-accent-black placeholder:text-black-alpha-48 focus:outline-none"
                      placeholder="Build a modern SaaS landing page for an AI meeting assistant with pricing, testimonials, dashboard preview, and a polished mobile layout..."
                      value={prompt}
                      disabled={isOptimizing}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                  </div>

                  <div className="p-16 grid gap-12 bg-white">
                    <div className="grid md:grid-cols-[1fr_auto] gap-12">
                      <input
                        className="px-12 py-10 text-sm rounded-10 border border-black-alpha-10 bg-gray-50 text-accent-black placeholder:text-black-alpha-48 focus:outline-none focus:border-orange-500"
                        placeholder={detectedUrl ? `Using ${detectedUrl}` : "Optional site link for content/style inspiration"}
                        value={siteUrl}
                        disabled={isOptimizing}
                        onChange={(event) => setSiteUrl(event.target.value)}
                      />
                      <select
                        value={selectedModel}
                        disabled={isOptimizing}
                        onChange={(event) => setSelectedModel(event.target.value)}
                        className="px-12 py-10 text-sm rounded-10 border border-black-alpha-10 bg-gray-50 text-accent-black focus:outline-none focus:border-orange-500"
                      >
                        {appConfig.ai.availableModels.map((model) => (
                          <option key={model} value={model}>
                            {appConfig.ai.modelDisplayNames[model] || model}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-12">
                      <div className="flex flex-wrap items-center gap-8">
                        <label className="button rounded-10 px-12 py-8 text-label-medium font-medium bg-black-alpha-4 hover:bg-black-alpha-6 text-accent-black cursor-pointer transition-all">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={isOptimizing}
                            onChange={handleImageUpload}
                          />
                          {referenceImageName ? "Change image" : "Attach image"}
                        </label>
                        {referenceImageName && (
                          <button
                            type="button"
                            className="rounded-10 px-10 py-8 text-label-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                            onClick={() => {
                              setReferenceImage("");
                              setReferenceImageName("");
                            }}
                          >
                            {referenceImageName}
                          </button>
                        )}
                      </div>

                      <HeroInputSubmitButton
                        dirty={hasPrompt}
                        buttonText={isOptimizing ? "Optimizing..." : "Make App"}
                        disabled={!hasPrompt || isOptimizing}
                        type="submit"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-248 top-84 cw-768 pointer-events-none absolute overflow-clip -z-10">
                  <AsciiExplosion className="-top-200" />
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </HeaderProvider>
  );
}
