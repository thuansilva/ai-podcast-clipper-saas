const fs = require('fs');

function fixYoutubeInfo() {
  const file = 'src/app/api/youtube/info/route.ts';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    'const oembedData = await oembedResponse.json();',
    'const oembedData = (await oembedResponse.json()) as { title?: string; thumbnail_url?: string };'
  );
  content = content.replace(
    'const title = oembedData.title;',
    'const title = oembedData.title ?? "";'
  );
  content = content.replace(
    'const thumbnailUrl = oembedData.thumbnail_url;',
    'const thumbnailUrl = oembedData.thumbnail_url ?? "";'
  );
  content = content.replace(
    'catch (error) {',
    'catch (error: unknown) {'
  );
  fs.writeFileSync(file, content);
}

function fixBillingPage() {
  const file = 'src/app/dashboard/billing/page.tsx';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('import { Check, Loader2, Zap } from "lucide-react";', 'import { Check, Loader2 } from "lucide-react";');
  content = content.replace('catch (error: any) {', 'catch (error: unknown) {');
  fs.writeFileSync(file, content);
}

function fixAppSidebar() {
  const file = 'src/components/dashboard/app-sidebar.tsx';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/user\?\.fullName \|\|/g, 'user?.fullName ??');
  fs.writeFileSync(file, content);
}

function fixCreateProjectClient() {
  const file = 'src/components/dashboard/create-project-client.tsx';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('const data = await res.json();', 'const data = (await res.json()) as { error?: string; title?: string; durationSeconds?: number; thumbnailUrl?: string; };');
  content = content.replace('data.error || "Failed to fetch video info"', 'data.error ?? "Failed to fetch video info"');
  content = content.replace('catch (err: any) {', 'catch (err: unknown) {');
  content = content.replace('err.message || "Failed to fetch video info"', '(err instanceof Error ? err.message : "Failed to fetch video info")');
  content = content.replace('onSubmit={handleSubmit(onSubmit)}', 'onSubmit={(e) => void handleSubmit(onSubmit)(e)}');
  fs.writeFileSync(file, content);
}

function fixRecentVideos() {
  const file = 'src/components/dashboard/recent-videos-client.tsx';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('import { PlayIcon, Loader2 } from "lucide-react";', 'import { PlayIcon } from "lucide-react";');
  content = content.replace('const [refreshing, setRefreshing] = useState(false);', '');
  content = content.replace('video.displayName ||', 'video.displayName ??');
  fs.writeFileSync(file, content);
}

function fixTopBar() {
  const file = 'src/components/dashboard/top-bar.tsx';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('import { UserButton } from "@clerk/nextjs";', '');
  fs.writeFileSync(file, content);
}

function fixPricingSection() {
  const file = 'src/components/landing/pricing-section.tsx';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('user?.id ||', 'user?.id ??');
  fs.writeFileSync(file, content);
}

fixYoutubeInfo();
fixBillingPage();
fixAppSidebar();
fixCreateProjectClient();
fixRecentVideos();
fixTopBar();
fixPricingSection();
