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

        <h2>A few terms</h2>
        <dl className="terms">
          <dt>Walking network</dt>
          <dd>
            Every street, footpath and walkway in Hamilton that OpenStreetMap
            says you can walk on, joined up wherever they meet.
          </dd>
          <dt>Junction</dt>
          <dd>
            A point on the network where paths meet or a path ends. Walks are
            measured from junction to junction along the paths between them.
          </dd>
          <dt>Starting junction</dt>
          <dd>
            The junction nearest the spot you pick. Every walk from your spot
            is measured from there.
          </dd>
          <dt>Walking band</dt>
          <dd>
            The area you can reach within 5, 10 or 15 minutes, shaded on the
            map. Sometimes called an isochrone.
          </dd>
          <dt>Within reach</dt>
          <dd>
            An amenity is within reach when a 15 minute walk gets to a junction
            close to it: within 100 m of one mapped as a single point, like a
            bus stop, or within 50 m of the edge of one mapped with an
            outline, like most parks and schools.
          </dd>
        </dl>

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
          When you pick a spot, WalkReach finds its starting junction and
          follows every path outward from it until it has walked 1,250 m. The
          shaded bands on the map outline the places reached within each
          distance. The outline is drawn around the junctions reached, so treat
          the edge as approximate.
        </p>
        <p>
          A spot more than 200 m from any path, out in a paddock or the middle
          of the lake, is outside the network. It gets no bands and a score of
          0, rather than being scored from wherever the nearest path happens
          to lead. A few paths are mapped on their own, joined to nothing
          else; a walk never starts on one of those.
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
        <p>
          A second or third supermarket nearby adds nothing to the score, but
          how many there are is shown below it.
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

        <h2>What is within reach</h2>
        <p>
          Under the score, a table counts how many of each essential are within
          a 5, 10 and 15 minute walk. The counts add up as the walk gets
          longer: anything within 5 minutes is also within 10.
        </p>
        <p>
          Open a category to list everything of that kind within 15 minutes,
          nearest first, with its walking distance. Pick one to see the walk
          there drawn on the map. The solid line is the walk that was measured.
          The short dashed lines at each end, from your spot onto the network
          and from the network to the amenity, are not part of the distance.
        </p>

        <h2>Comparing two places</h2>
        <p>
          In “Compare two places”, pick a place A and a place B. Each one’s
          whole 15 minute walk is shaded in its own colour, and the panel sets
          the two scores and the nearest of each essential side by side. The
          closer of the two is shown in bold.
        </p>
        <p>
          The address bar always holds the places on screen, so the link can be
          shared or bookmarked and opens straight on the same result.
        </p>

        <h2>Finding an address</h2>
        <p>
          As you type, WalkReach suggests suburbs, streets and named
          supermarkets, clinics, schools and parks from its own copy of the
          map. A suburb or a named place goes straight to its spot. A street is
          looked up with Nominatim once you pick it, because a street can run
          for kilometres; if it has more than one part, you choose which. Type
          a house number first, as in “13 Hukanui”, to look up that address.
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
            Suggestions come from the same OpenStreetMap data. Addresses and
            streets are looked up with{" "}
            <a href="https://nominatim.openstreetmap.org">Nominatim</a>,
            limited to Hamilton.
          </li>
        </ul>

        <h2>Limitations</h2>
        <ul>
          <li>
            The results are only as good as OpenStreetMap. A missing footpath
            makes a walk look longer than it is, and an unmapped supermarket is
            not counted. A shop that has closed stays until someone removes it
            from the map, and a place mapped without a name is listed as
            unnamed.
          </li>
          <li>
            The walk starts at the nearest junction, not at your door, and the
            stretch between them is not counted. For spots on a street that
            stretch is usually short, about 25 m, and under 90 m nine times in
            ten. On a long road with few junctions it can be a few hundred
            metres.
          </li>
          <li>
            The last stretch to an amenity, from the junction to its door or
            the edge of its grounds, is not counted either.
          </li>
          <li>
            Only the nearest of each essential counts towards the score. Having
            three supermarkets within reach scores the same as having one,
            although all three are listed.
          </li>
          <li>
            The walking speed is the same everywhere. Hills, waits at crossings
            and mobility needs are not taken into account.
          </li>
          <li>
            30 of the 1,642 amenities, 24 of them bus stops, are too far from
            any mapped path to be matched to the network, so they are never
            within reach and never count towards a score.
          </li>
          <li>
            Only locations in and just around Hamilton can be analysed.
          </li>
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
