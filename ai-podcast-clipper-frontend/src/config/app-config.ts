import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Podcast Clipper",
  version: packageJson.version,
  copyright: `© ${currentYear}, Podcast Clipper.`,
  meta: {
    title: "Podcast Clipper - Studio",
    description:
      "Podcast Clipper transforma podcasts longos em clipes verticais curtos, detectando os momentos mais virais, seguindo o rosto do speaker ativo e gerando legendas automaticamente.",
  },
};
