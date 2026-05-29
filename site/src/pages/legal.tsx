// Impressum (§ 5 DDG / § 18 MStV) and Datenschutzerklärung (DSGVO) for a
// static, data-minimal site hosted on GitHub Pages. Hinweis: rechtliche
// Vorlage — bei Bedarf anwaltlich prüfen lassen.
import type { ReactNode } from "react";

const OWNER = {
  name: "Belkis Aslani",
  street: "Vogelsangstr. 32",
  city: "71691 Freiberg am Neckar",
  country: "Deutschland",
  email: "belkis.aslani@gmail.com",
  phone: "+49 176 81462526",
  phoneHref: "+4917681462526",
};

function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="container-px pt-32 pb-24 sm:pt-36">
      <div className="mx-auto max-w-3xl">
        <span className="kicker">Rechtliches</span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <div className="mt-10 space-y-8 text-slate-300 [&_a]:text-holo-cyan [&_a:hover]:underline [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_p]:leading-relaxed [&_p]:text-slate-400">
          {children}
        </div>
      </div>
    </section>
  );
}

function Block({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="glass holo-border rounded-2xl p-6 sm:p-7">
      <h2>{heading}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export function Impressum() {
  return (
    <LegalLayout title="Impressum">
      <Block heading="Angaben gemäß § 5 DDG">
        <p>
          {OWNER.name}
          <br />
          {OWNER.street}
          <br />
          {OWNER.city}
          <br />
          {OWNER.country}
        </p>
      </Block>

      <Block heading="Kontakt">
        <p>
          Telefon:{" "}
          <a href={`tel:${OWNER.phoneHref}`}>{OWNER.phone}</a>
          <br />
          E-Mail: <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>
        </p>
      </Block>

      <Block heading="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p>
          {OWNER.name}
          <br />
          {OWNER.street}, {OWNER.city}
        </p>
      </Block>

      <Block heading="Verbraucherstreitbeilegung / Universalschlichtungsstelle">
        <p>
          Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren
          vor einer Verbraucherschlichtungsstelle teilzunehmen.
        </p>
        <p>
          Hinweis: Die von der EU-Kommission bereitgestellte Plattform zur
          Online-Streitbeilegung (OS) wurde zum 20.07.2025 eingestellt.
        </p>
      </Block>

      <Block heading="Haftung für Inhalte">
        <p>
          Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte
          auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
          §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht
          verpflichtet, übermittelte oder gespeicherte fremde Informationen zu
          überwachen oder nach Umständen zu forschen, die auf eine
          rechtswidrige Tätigkeit hinweisen.
        </p>
      </Block>

      <Block heading="Haftung für Links">
        <p>
          Unser Angebot enthält ggf. Links zu externen Websites Dritter, auf
          deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese
          fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der
          verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der
          Seiten verantwortlich.
        </p>
      </Block>

      <Block heading="Urheberrecht">
        <p>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen
          Seiten unterliegen dem deutschen Urheberrecht. Die Prompt-Datensätze
          dienen Demonstrations- und Informationszwecken. Beiträge Dritter sind
          als solche gekennzeichnet.
        </p>
      </Block>
    </LegalLayout>
  );
}

export function Datenschutz() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <Block heading="1. Verantwortlicher">
        <p>
          Verantwortlich im Sinne der Datenschutz-Grundverordnung (DSGVO):
        </p>
        <p>
          {OWNER.name}
          <br />
          {OWNER.street}, {OWNER.city}, {OWNER.country}
          <br />
          E-Mail: <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>
          <br />
          Telefon: <a href={`tel:${OWNER.phoneHref}`}>{OWNER.phone}</a>
        </p>
      </Block>

      <Block heading="2. Allgemeines zur Datenverarbeitung">
        <p>
          Diese Website ist eine statische Anwendung und verwendet{" "}
          <strong className="text-slate-200">keine Cookies</strong>, kein
          Tracking, keine Analyse-Tools und keine Kontaktformulare. Es werden
          über die Seite selbst keine personenbezogenen Daten aktiv erhoben oder
          gespeichert. Die angezeigten Prompt-Daten werden ausschließlich lokal
          in Ihrem Browser geladen und verarbeitet.
        </p>
      </Block>

      <Block heading="3. Hosting (GitHub Pages)">
        <p>
          Diese Website wird über GitHub Pages gehostet, einen Dienst der GitHub,
          Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Beim
          Aufruf der Seite verarbeitet GitHub technisch notwendige Daten (u. a.
          Ihre IP-Adresse, Datum/Uhrzeit des Zugriffs, abgerufene Datei,
          Browser-/Geräteinformationen) in Server-Logfiles, um die Auslieferung
          der Seite zu ermöglichen und deren Sicherheit zu gewährleisten.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
          an einer sicheren und effizienten Bereitstellung der Website). Details:
          siehe die Datenschutzerklärung von GitHub unter{" "}
          <a
            href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement"
            target="_blank"
            rel="noreferrer noopener"
          >
            docs.github.com
          </a>
          .
        </p>
      </Block>

      <Block heading="4. Ihre Rechte">
        <p>
          Sie haben im Rahmen der gesetzlichen Bestimmungen das Recht auf
          Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art.
          20) sowie ein Widerspruchsrecht (Art. 21). Zur Ausübung wenden Sie sich
          an die oben genannten Kontaktdaten.
        </p>
        <p>
          Ihnen steht zudem ein Beschwerderecht bei einer
          Datenschutz-Aufsichtsbehörde zu, in der Regel am Ort Ihres
          gewöhnlichen Aufenthalts oder unseres Sitzes (Baden-Württemberg: Der
          Landesbeauftragte für den Datenschutz und die Informationsfreiheit
          Baden-Württemberg).
        </p>
      </Block>

      <p className="text-sm text-slate-500">Stand: Mai 2026</p>
    </LegalLayout>
  );
}
