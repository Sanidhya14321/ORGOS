export function GET() {
  return Response.json({
    name: "ORGOS",
    short_name: "ORGOS",
    description: "AI Organizational Operating System",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b1020",
    theme_color: "#2dd4bf",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  }, {
    headers: {
      "Content-Type": "application/manifest+json"
    }
  });
}