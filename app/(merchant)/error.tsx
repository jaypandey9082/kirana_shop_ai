"use client";
import { ErrorBanner } from "@/components/ui/primitives";
export default function Error({ reset }: { reset: () => void }) { return <ErrorBanner message="Screen load nahi hua. Phir se try karein." onRetry={reset} />; }
