import { Head, Html, Main, NextScript } from "next/document";
import Document, { type DocumentContext, type DocumentInitialProps } from "next/document";

export default function CustomDocument() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

CustomDocument.getInitialProps = async (ctx: DocumentContext): Promise<DocumentInitialProps> => {
  return Document.getInitialProps(ctx);
};
