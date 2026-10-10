import { Developers } from "@/components/landing/developers";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Privacy } from "@/components/landing/privacy";
import { Protocol } from "@/components/landing/protocol";

export default function Home() {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <Protocol />
        <Privacy />
        <Developers />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
