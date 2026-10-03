import { notFound } from "next/navigation";
import { supplierBySlug } from "@/lib/demo/suppliers";
import { DistributorPortal } from "@/components/distributor/portal";

export const metadata = { title: "Distributor · Kirana Shop AI", robots: { index: false } };

/** Demo distributor view (no login). "/d/all" shows every demo distributor for the projector. */
export default async function Page(props: PageProps<"/d/[slug]">) {
  const { slug } = await props.params;
  const s = slug === "all" ? { slug: "all", name: "Sabhi distributors", area: "Mumbai" } : supplierBySlug(slug);
  if (!s) notFound();
  return <DistributorPortal slug={s.slug} name={s.name.replace(" (demo supplier)", "")} area={s.area} />;
}
