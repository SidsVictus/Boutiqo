import type { Metadata } from "next";
import { Reveal } from "@/components/landing/Reveal";
import { APP_VERSION, DOWNLOAD_URL } from "@/components/landing/download";
import { QrCode } from "@/components/landing/QrCode";
import {
  BalanceBar,
  HeroThread,
  LoadCalendar,
  MeasuringTape,
  OrderCardMock,
  Spool,
  StageStitch,
  StitchDivider,
} from "@/components/landing/illustrations";

/**
 * Marketing page for the Android app — deliberately standalone: no links to
 * the dashboard or signup, one CTA (the EAS build page) plus a QR for
 * desktop visitors. Copy is locked in docs/Landing page.md §6; colours and
 * motion come only from the design tokens (see that doc §4).
 */

export const metadata: Metadata = {
  title: "Boutiqo — your order book, on your phone",
  description:
    "Orders, measurements, delivery dates and payments — one app for your boutique. Get the Boutiqo Android app.",
};

const downloadLink = {
  href: DOWNLOAD_URL,
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

export default function LandingPage() {
  return (
    <div className="bq-lp">
      <header className="bq-lp-header">
        <div className="bq-lp-container bq-lp-header__row">
          <span className="bq-lp-wordmark">
            boutiqo<span className="bq-lp-dot" aria-hidden="true" />
          </span>
          <a className="bq-lp-quiet" href="#download">
            Get the app
          </a>
        </div>
      </header>

      <main>
        <section className="bq-lp-section bq-lp-hero">
          <div className="bq-lp-container bq-lp-hero__inner">
            <p className="bq-lp-eyebrow">Order book for boutiques</p>
            <h1 className="bq-lp-h1">
              Your order book,
              <br />
              on your phone.
            </h1>
            <HeroThread />
            <p className="bq-lp-lede">
              Orders, measurements, delivery dates and payments — one app for
              your boutique.
            </p>
            <div className="bq-lp-cta">
              <div className="bq-lp-cta__main">
                <a className="bq-lp-btn" {...downloadLink}>
                  Get the app
                  <span className="bq-lp-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
                <span className="bq-lp-cta__note">
                  Android · APK · v{APP_VERSION}
                </span>
              </div>
              <div className="bq-lp-qrcard">
                <QrCode className="bq-lp-qr" />
                <span className="bq-lp-qrcard__cap">Scan with your phone</span>
              </div>
            </div>
          </div>
        </section>

        <StitchDivider />

        <section className="bq-lp-section">
          <div className="bq-lp-container">
            <Reveal>
              <h2 className="bq-lp-h2 bq-lp-h2--center">
                Every order moves through five stages
              </h2>
              <p className="bq-lp-cap">
                You advance the stage. The due date is tracked for you.
              </p>
              <StageStitch />
            </Reveal>
          </div>
        </section>

        <section className="bq-lp-section bq-lp-section--blush">
          <div className="bq-lp-container bq-lp-split">
            <Reveal className="bq-lp-split__copy">
              <h2 className="bq-lp-h2">Send your customer a link</h2>
              <p className="bq-lp-body">
                It opens in WhatsApp with the stage, due date, balance and
                cloth photo. No account, no app needed.
              </p>
            </Reveal>
            <Reveal className="bq-lp-split__art" delay={150}>
              <OrderCardMock />
            </Reveal>
          </div>
        </section>

        <StitchDivider />

        <section className="bq-lp-section">
          <div className="bq-lp-container">
            <div className="bq-lp-facts">
              <Reveal className="bq-lp-fact">
                <h2 className="bq-lp-fact__title">Dictate measurements</h2>
                <p className="bq-lp-fact__line">
                  Fourteen measurements, by voice or typing.
                </p>
                <MeasuringTape />
              </Reveal>
              <Reveal className="bq-lp-fact" delay={120}>
                <h2 className="bq-lp-fact__title">See the busy days</h2>
                <p className="bq-lp-fact__line">
                  Every delivery date, coloured by workload.
                </p>
                <LoadCalendar />
              </Reveal>
              <Reveal className="bq-lp-fact" delay={240}>
                <h2 className="bq-lp-fact__title">Know what is owed</h2>
                <p className="bq-lp-fact__line">
                  Total, advance and balance on every order.
                </p>
                <BalanceBar />
              </Reveal>
            </div>
          </div>
        </section>

        <section className="bq-lp-download" id="download">
          <StitchDivider />
          <div className="bq-lp-container bq-lp-download__grid">
            <div className="bq-lp-download__copy">
              <h2 className="bq-lp-h2 bq-lp-h2--inverse">Get the app</h2>
              <p className="bq-lp-download__line">
                Android · version {APP_VERSION} · direct APK install
              </p>
              <a className="bq-lp-btn bq-lp-btn--invert" {...downloadLink}>
                Download for Android
                <span className="bq-lp-arrow" aria-hidden="true">
                  →
                </span>
              </a>
              <p className="bq-lp-install">
                Open on your phone · Allow install · Open
              </p>
            </div>
            <Spool />
            <div className="bq-lp-qrcard">
              <QrCode className="bq-lp-qr" />
              <span className="bq-lp-qrcard__cap">Scan with your phone</span>
            </div>
          </div>
        </section>

        <section className="bq-lp-section bq-lp-helpdesk">
          <div className="bq-lp-container">
            <Reveal className="bq-lp-helpdesk__inner">
              <h2 className="bq-lp-h2">Help desk</h2>
              <p className="bq-lp-cap">Questions about the app? Write to us.</p>
              <a className="bq-lp-btn" href="mailto:help.boutiqo@gmail.com">
                help.boutiqo@gmail.com
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="bq-lp-footer">
        <div className="bq-lp-container bq-lp-footer__row">
          <span className="bq-lp-wordmark bq-lp-wordmark--sm">
            boutiqo<span className="bq-lp-dot" aria-hidden="true" />
          </span>
          <span className="bq-lp-footer__copy">© 2026 Boutiqo. All rights reserved.</span>
          <nav className="bq-lp-footer__nav" aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
