import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works · WalkReach",
  description:
    "How WalkReach measures walking distance, draws the walking bands and scores a location in Hamilton, NZ.",
};

const WEIGHTS = [
  { category: "Supermarket", points: 30 },
  { category: "Clinic", points: 25 },
  { category: "School", points: 20 },
  { category: "Park", points: 15 },
  { category: "Bus stop", points: 10 },
];

export default function HowItWorks() {
  return (
    <main className="article-page">
      <article className="article">
        <h1>How it works</h1>
        <p className="lede">
          WalkReach answers one question: from a given spot in Hamilton, how
          much of everyday life can you reach on foot?
        </p>

        <h2>Walking distance, not straight-line distance</h2>
        <p>
          Most “minutes from the shops” claims measure distance as the crow
          flies. People do not walk that way. A supermarket 400 m away in a
          straight line can be a 2 km walk if the Waikato River is in between
          and the nearest bridge is further along.
        </p>
        <p>
          WalkReach routes every walk over the real network of streets,
          footpaths and walkways, so bridges, dead ends, rail lines and the
          river all count, just as they would if you walked it.
        </p>

        <h2>The three walking bands</h2>
        <p>
          Walking speed is taken as 1.4 m/s, about 5 km/h. That turns 5, 10
          and 15 minutes into distances of 417 m, 833 m and 1,250 m along the
          network.
        </p>
        <p>
          When you pick a spot, WalkReach finds the nearest point on the
          walking network and follows every path outward until it has walked
          1,250 m. The shaded bands on the map outline the places reached
          within each distance. The outline is drawn around the points reached
          on the network, so treat the edge as approximate.
        </p>

        <h2>The score</h2>
        <p>
          The score out of 100 is shared across five everyday essentials. Each
          one has a maximum number of points, weighted by how often most people
          need it.
        </p>
        <table>
          <thead>
            <tr>
              <th>Essential</th>
              <th className="num">Max points</th>
            </tr>
          </thead>
          <tbody>
            {WEIGHTS.map((w) => (
              <tr key={w.category}>
                <td>{w.category}</td>
                <td className="num">{w.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          For each essential, only the <strong>nearest</strong> one counts.
          Its points fall off in a straight line with walking distance. Right
          next door earns full marks, and 1,250 m (a 15 minute walk) or more
          earns nothing.
        </p>
        <p className="worked">
          For example, from the city centre the nearest supermarket is a 403 m
          walk. That earns 30 × (1 − 403 ÷ 1,250) = 20.3 of its 30 points.
        </p>
        <p>
          The label next to the score, from “Car-dependent” up to “Everything
          close by”, is a plain-language reading of the same number.
        </p>

        <h2>What counts as each essential</h2>
        <ul>
          <li>
            <strong>Supermarket</strong>: supermarkets, not dairies or
            convenience stores.
          </li>
          <li>
            <strong>Clinic</strong>: clinics, GP practices and hospitals.
            Pharmacies are not counted, because you cannot see a doctor at one.
          </li>
          <li>
            <strong>School</strong>: places mapped as schools.
            Kindergartens are not counted, because only a household with a
            preschooler has any use for one.
          </li>
          <li>
            <strong>Park</strong>: public parks.
          </li>
          <li>
            <strong>Bus stop</strong>: bus stops and platforms.
          </li>
        </ul>
        <p>
          Parks, schools and other places with a mapped footprint are measured
          to the nearest part you can walk up to, not to their centre. A large
          park that runs along your street is right there, even if its middle
          is 200 m away.
        </p>

        <h2>Data and tools</h2>
        <ul>
          <li>
            Streets, footpaths and amenities come from{" "}
            <a href="https://www.openstreetmap.org">OpenStreetMap</a>.
          </li>
          <li>
            Routing runs in PostgreSQL with PostGIS and pgRouting.
          </li>
          <li>
            The map is drawn with MapLibre GL over OpenStreetMap tiles.
          </li>
          <li>
            Address search uses{" "}
            <a href="https://nominatim.openstreetmap.org">Nominatim</a>,
            limited to Hamilton.
          </li>
        </ul>

        <h2>Limitations</h2>
        <ul>
          <li>
            The results are only as good as OpenStreetMap. A missing footpath
            makes a walk look longer than it is, and an unmapped supermarket is
            not counted.
          </li>
          <li>
            Only the nearest of each essential counts. Having three
            supermarkets within reach scores the same as having one.
          </li>
          <li>
            The walking speed is the same everywhere. Hills, waits at crossings
            and mobility needs are not taken into account.
          </li>
          <li>
            23 of about 1,400 amenities, mostly bus stops, are too far from any
            mapped path to be matched to the network, so they do not count
            towards any score.
          </li>
          <li>Only locations inside Hamilton can be analysed.</li>
        </ul>

        <h2>About</h2>
        <p>
          WalkReach is a COMPX576 research project for the Master of
          Information Technology at the University of Waikato, and is still
          under active development. Map data © OpenStreetMap contributors,
          available under the{" "}
          <a href="https://www.openstreetmap.org/copyright">
            Open Database License
          </a>
          .
        </p>

        <Link href="/" className="cta">
          Try it on the map
        </Link>
      </article>
    </main>
  );
}
