import { importMenu } from "./actions";
import { ChatMenuImporter } from "./importer";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Import Menu</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Paste a chat menu exactly as it is — emoji headers, mixed bullets,
          sold-out marks, prices written five different ways. Everything is
          parsed into a preview you approve before anything touches the
          catalog.
        </p>
      </header>
      <ChatMenuImporter brandSlug={slug} importAction={importMenu} />
    </div>
  );
}
