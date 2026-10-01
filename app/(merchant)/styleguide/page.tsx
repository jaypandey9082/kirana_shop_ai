import { notFound } from "next/navigation";
import { Styleguide } from "@/components/kirana/styleguide";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Styleguide />;
}
