<script lang="ts">
  import { i18n, strokeLabel } from '../lib/i18n.svelte';
  import { INSTRUMENTS } from '../lib/instruments';
</script>

{#snippet instruments(h1: string, h2: string, h3: string)}
  <table>
    <thead><tr><th>{h1}</th><th>{h2}</th><th>{h3}</th></tr></thead>
    <tbody>
      {#each INSTRUMENTS as i (i.id)}
        <tr>
          <td><span class="dot" style="--hue:{i.hue}"></span>{i.name}</td>
          <td><code>{i.aliases.join(', ')}</code></td>
          <td>
            {#each i.strokes as s (s.char)}
              <span class="stroke"><code>{s.char}</code> {strokeLabel(s.label)}</span>
            {/each}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

<article>
  {#if i18n.lang === 'fr'}
  <h2>Comment ça marche</h2>
  <p>
    Un morceau est un ensemble de <b>sections</b> (groove, appel, breaks…) avec une ligne par instrument, plus un
    <b>enchaînement</b> qui indique dans quel ordre les jouer.
  </p>

  <h3>Grille</h3>
  <ul>
    <li>Touchez une case pour passer d’une frappe de l’instrument à l’autre, puis revenir au silence. Le clic droit vide une case.</li>
    <li><b>M</b> coupe une ligne, <b>S</b> ne joue que les lignes en solo. Les deux s’appliquent à toutes les sections.</li>
    <li>
      Faites glisser la poignée pointillée à gauche du nom d’un instrument pour monter ou descendre la ligne (ou
      sélectionnez-la et utilisez les flèches du clavier). <b>⇅ Utiliser cet ordre de lignes dans toutes les sections</b>
      range les lignes des autres sections dans le même ordre.
    </li>
    <li>
      <b>↑</b> et <b>↓</b> dans l’en-tête d’une section la déplacent sur la page (ou Alt+↑ / Alt+↓ dans l’en-tête).
      <b>⧉</b> place la copie juste sous l’original ; montez-la ou descendez-la ensuite. L’ordre de lecture reste celui
      de l’arrangement.
    </li>
    <li>
      <b>▶ Lecture</b> dans l’en-tête d’une section la joue seule, une fois, sans tenir compte de l’arrangement. Allumez
      <b>🔁</b> à côté pour la répéter jusqu’à <b>■ Stop</b> ; pratique pour travailler un groove. L’éteindre pendant la
      lecture termine le tour en cours puis s’arrête.
    </li>
    <li>
      Le petit menu <b>÷4</b> à côté du nom d’un instrument règle le nombre de pas par temps de cette ligne. Choisissez
      <b>÷3</b> pour la jouer en triolets pendant que les autres lignes restent carrées : chaque temps garde la même
      largeur, on voit donc le 3 contre 4. Le premier choix suit la section. Le changer déplace les notes sur le pas
      le plus proche.
    </li>
  </ul>

  <h3>Jouer en direct</h3>
  <ul>
    <li>La rangée <b>Morceau</b> en bas suit l’enchaînement. Touchez une partie pour y aller à la prochaine barre de mesure.</li>
    <li>Les parties marquées ∞ tournent en boucle jusqu’à ce que vous appuyiez sur <b>Suivant</b> ou touchiez une autre partie.</li>
    <li>La rangée <b>Boucle</b> joue une seule section en boucle ; en toucher une autre bascule à la prochaine barre de mesure.</li>
    <li>La barre d’espace lance et arrête la lecture (quand vous n’êtes pas en train d’écrire).</li>
    <li>
      Le menu de mesure à côté du tempo règle celle du morceau : 4/4, 2/4, 3/4 ou les mesures ternaires 6/8 et 12/8.
      Chaque section a aussi son propre menu : un break peut passer en ternaire dans un morceau en 4/4 (« Morceau »
      suit celle du morceau). La pulsation ne change pas : une section en 12/8 joue 3 pas par temps au lieu de 4. Quand
      vous changez une mesure, les notes vont sur le pas le plus proche de la nouvelle grille ; vous êtes prévenu si
      certaines n’y tiennent pas. Le swing ne s’applique qu’aux lignes qui ont un nombre pair de pas par temps.
    </li>
  </ul>

  <h3>Format texte</h3>
  <p>Les mots-clés du format restent en anglais (<code>title</code>, <code>tempo</code>, <code>bars</code>, <code>arrangement</code>, <code>loop</code>…), pour que les fichiers marchent quelle que soit la langue choisie.</p>
  <pre>title: Ma samba
tempo: 100      # temps par minute
swing: 15       # 0–100, retarde une double-croche sur deux
beats: 4        # facultatif, temps par mesure (4 par défaut)
subdiv: 4       # facultatif, pas par temps (4 par défaut)

[groove] bars=1
fundo1:   m... X... m... X...
caixa:    X.xx x.xx X.xx x.xg
repi lead: x.xX .xx. x.xX .xx.

[break1] bars=2
...

arrangement: call, groove*loop, break1, groove*4</pre>
  <ul>
    <li>Un caractère = un pas. Les espaces et <code>|</code> sont ignorés : servez-vous-en pour regrouper temps et mesures.</li>
    <li>
      Silences : <code>.</code> <code>-</code> ou <code>_</code>. Un <code>#</code> en début de ligne ou après un espace
      commence un commentaire.
    </li>
    <li>
      Le nom d’une ligne doit seulement <i>commencer</i> par un nom d’instrument : <code>repi lead</code> et
      <code>repi 2</code> sont tous deux des repiniques.
    </li>
    <li>
      Une section peut avoir sa propre mesure : <code>[break] bars=2 subdiv=3</code> (en 12/8) ou
      <code>[outro] beats=3</code> (en 3/4). Sinon elle utilise <code>beats</code> et <code>subdiv</code> du morceau.
    </li>
    <li>
      Une ligne peut avoir ses propres pas par temps : <code>caixa {'{'}subdiv=3{'}'}: X.x x.x X.x x.x</code> joue
      des triolets sur la pulsation de la section.
    </li>
    <li>Sans <code>bars=</code>, la longueur d’une section vient de sa ligne la plus longue. Les lignes plus courtes sont complétées par des silences.</li>
    <li>Dans l’enchaînement, <code>*4</code> répète 4 fois ; <code>*loop</code> (ou <code>*inf</code>, <code>*∞</code>) répète jusqu’à ce que vous passiez à la suite.</li>
    <li>Modifier la grille réécrit proprement le texte : les commentaires ne sont pas conservés.</li>
  </ul>

  <h3>Bibliothèque et parties partagées</h3>
  <ul>
    <li>
      <b>📚 Bibliothèque</b> liste les fichiers <code>.txt</code> du dossier <code>songs/</code> du projet. Les
      sous-dossiers (par ex. <code>grooves/</code>, <code>breaks/</code>) deviennent des groupes. Déposez-y des morceaux
      exportés pour les ajouter.
    </li>
    <li><b>Ouvrir</b> charge un morceau. <b>+ Ajouter</b> insère un groove ou un break dans le morceau actuel comme section <i>liée</i>.</li>
    <li>
      Une section liée est une simple référence : <code>[groove] = grooves/samba-basic</code> joue
      <code>songs/grooves/samba-basic.txt</code>. Utilisez <code>fichier#section</code> pour choisir une section d’un
      fichier qui en contient plusieurs.
    </li>
    <li>
      Modifier un fichier de la bibliothèque le modifie dans <b>tous les morceaux qui y font référence</b>. Cliquer sur
      une section liée vous propose : <b>✎ Modifier le fichier de la bibliothèque</b> (vos changements sont enregistrés
      dans le fichier au fur et à mesure et tous les morceaux qui l’utilisent suivent ; <b>Terminé</b> la verrouille à
      nouveau) ou <b>Délier</b> (une copie locale propre à ce morceau). La modification des fichiers de la bibliothèque
      ne fonctionne que sur l’ordinateur qui exécute <code>npm run dev</code>.
    </li>
    <li>
      Ce sont le tempo et le swing du morceau qui s’appliquent, pas ceux du fichier lié. Une section liée garde la
      mesure de son fichier : un break en 12/8 de la bibliothèque s’insère dans un morceau en 4/4.
    </li>
    <li>
      <b>💾 Vers la bibliothèque</b> sur une section enregistre uniquement cette section dans son propre
      fichier (par ex. <code>songs/grooves/mon-groove.txt</code>) et y relie le morceau.
    </li>
    <li>
      <b>💾 Enregistrer</b> écrit le morceau entier dans <code>songs/</code> ; <b>Enregistrer sous…</b> en fait une
      copie sous un autre nom. Sous le titre, vous voyez dans quel fichier le morceau est enregistré, ou
      <b>● modifié</b> s’il y a des changements non enregistrés.
    </li>
    <li>
      L’enregistrement dans le dossier ne fonctionne que sur l’ordinateur qui exécute <code>npm run dev</code>. Sur le
      site en ligne, les mêmes boutons téléchargent le fichier, à ajouter à la main dans <code>songs/</code>.
    </li>
  </ul>

  <h3>Instruments et frappes</h3>
  {@render instruments('Instrument', 'Noms de ligne', 'Frappes')}

  <h3>Partager</h3>
  <p>
    <b>Partager</b> crée un lien qui contient tout le morceau, parties liées comprises : la personne qui l’ouvre obtient
    exactement votre enchaînement.
    <b>Exporter</b> enregistre un fichier <code>.txt</code> et <b>Importer</b> en charge un. Votre morceau actuel est
    aussi enregistré automatiquement dans ce navigateur.
  </p>
  {:else}
  <h2>How it works</h2>
  <p>
    A song is a set of <b>sections</b> (groove, call, breaks…) with one line per instrument, plus an
    <b>arrangement</b> that says in which order to play them.
  </p>

  <h3>Grid</h3>
  <ul>
    <li>Tap a cell to cycle through the instrument's strokes, then back to silence. Right-click clears a cell.</li>
    <li><b>M</b> mutes a line, <b>S</b> plays only the soloed lines. Both apply to every section.</li>
    <li>
      Drag the dotted handle left of an instrument name to move the line up or down (or focus it and use the arrow
      keys). <b>⇅ Use this line order in all sections</b> puts the other sections' lines in the same order.
    </li>
    <li>
      <b>↑</b> and <b>↓</b> in a section's header move it on the page (or Alt+↑ / Alt+↓ in the header). <b>⧉</b> puts
      the copy right below the original; move it from there. The play order still comes from the arrangement.
    </li>
    <li>
      <b>▶ Play</b> in a section's header plays that section on its own, once, whatever the arrangement says. Turn on
      <b>🔁</b> next to it to repeat it until <b>■ Stop</b>; handy for practising one groove. Turning it off while
      playing finishes the current pass, then stops.
    </li>
    <li>
      The small <b>÷4</b> menu next to an instrument name sets how many steps that line has per beat. Choose <b>÷3</b>
      to play it in triplets while the other lines stay square: every beat keeps the same width, so you see the 3
      against 4. The first choice follows the section. Changing it moves the notes to the nearest step.
    </li>
  </ul>

  <h3>Playing live</h3>
  <ul>
    <li>The <b>Song</b> row at the bottom follows the arrangement. Tap any part to jump there at the next bar line.</li>
    <li>Parts marked ∞ loop until you press <b>Next</b> or tap another part.</li>
    <li>The <b>Loop</b> row loops a single section; tapping another switches at the next bar line.</li>
    <li>Space bar starts and stops (when not typing).</li>
    <li>
      The time signature menu next to the tempo sets the song's: 4/4, 2/4, 3/4 or the ternary 6/8 and 12/8. Each
      section also has its own menu, so a break can go ternary inside a 4/4 song (“Song” follows the song's). The beat
      stays the same: a 12/8 section plays 3 steps per beat instead of 4. When you change a time signature, the notes
      move to the nearest step of the new grid; you're warned if some won't fit. Swing only applies to lines with an
      even number of steps per beat.
    </li>
  </ul>

  <h3>Text format</h3>
  <pre>title: My samba
tempo: 100      # beats per minute
swing: 15       # 0–100, pushes every 2nd sixteenth late
beats: 4        # optional, beats per bar (default 4)
subdiv: 4       # optional, steps per beat (default 4)

[groove] bars=1
fundo1:   m... X... m... X...
caixa:    X.xx x.xx X.xx x.xg
repi lead: x.xX .xx. x.xX .xx.

[break1] bars=2
...

arrangement: call, groove*loop, break1, groove*4</pre>
  <ul>
    <li>One character = one step. Spaces and <code>|</code> are ignored, so use them to group beats and bars.</li>
    <li>
      Rests: <code>.</code> <code>-</code> or <code>_</code>. A <code>#</code> at the start of a line or after a space
      starts a comment.
    </li>
    <li>
      A line's name just has to <i>start</i> with an instrument name, so <code>repi lead</code> and
      <code>repi 2</code> are both repiniques.
    </li>
    <li>
      A section can have its own time signature: <code>[break] bars=2 subdiv=3</code> (12/8 feel) or
      <code>[outro] beats=3</code> (3/4). Without them it uses the song's <code>beats</code> and <code>subdiv</code>.
    </li>
    <li>
      A line can have its own steps per beat: <code>caixa {'{'}subdiv=3{'}'}: X.x x.x X.x x.x</code> plays triplets over
      the section's beat.
    </li>
    <li>If a section has no <code>bars=</code>, its length comes from its longest line. Short lines are padded with rests.</li>
    <li>In the arrangement, <code>*4</code> repeats 4 times; <code>*loop</code> (or <code>*inf</code>, <code>*∞</code>) repeats until you move on.</li>
    <li>Editing in the grid rewrites the text neatly, so comments are not kept.</li>
  </ul>

  <h3>Library and shared parts</h3>
  <ul>
    <li>
      <b>📚 Library</b> lists the <code>.txt</code> files in the project's <code>songs/</code> folder. Subfolders
      (e.g. <code>grooves/</code>, <code>breaks/</code>) become groups. Drop exported songs there to add them.
    </li>
    <li><b>Open</b> loads a song. <b>+ Add</b> puts a groove or break into the current song as a <i>linked</i> section.</li>
    <li>
      A linked section is just a reference: <code>[groove] = grooves/samba-basic</code> plays
      <code>songs/grooves/samba-basic.txt</code>. Use <code>file#section</code> to pick one section of a file that has
      several.
    </li>
    <li>
      Changing a library file changes it in <b>every song that links to it</b>. Clicking a linked section asks what you
      want: <b>✎ Edit the library file</b> (your changes are saved to the file as you go and every song using it
      follows; <b>Done</b> locks it again) or <b>Unlink</b> (a local copy only this song uses). Editing library files
      only works on the computer running <code>npm run dev</code>.
    </li>
    <li>
      The song's own tempo and swing are used, not those of the linked file. A linked section keeps its file's time
      signature, so a 12/8 break from the library fits in a 4/4 song.
    </li>
    <li>
      <b>💾 Save to library</b> on a section saves just that section as its own file (e.g.
      <code>songs/grooves/my-groove.txt</code>) and links the song to it.
    </li>
    <li>
      <b>💾 Save</b> writes the whole song into <code>songs/</code>; <b>Save as…</b> makes a copy under another name. Under
      the title you see which file the song is saved in, or <b>● modified</b> when there are unsaved changes.
    </li>
    <li>
      Saving into the folder only works on the computer running <code>npm run dev</code>. On the deployed site, the same
      buttons download the file instead, to be added to <code>songs/</code> by hand.
    </li>
  </ul>

  <h3>Instruments &amp; strokes</h3>
  {@render instruments('Instrument', 'Line names', 'Strokes')}

  <h3>Sharing</h3>
  <p>
    <b>Share</b> creates a link containing the whole song, linked parts included, so whoever opens it gets exactly
    your arrangement.
    <b>Export</b> saves a <code>.txt</code> file and <b>Import</b> loads one. Your current song is also saved in this
    browser automatically.
  </p>
  {/if}
</article>

<style>
  article {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 4px 16px 12px;
    max-width: 860px;
  }
  h2 {
    font-size: 1.15rem;
  }
  h3 {
    font-size: 1rem;
    margin: 18px 0 6px;
  }
  ul {
    padding-left: 1.2em;
    margin: 0;
  }
  li {
    margin: 3px 0;
  }
  pre {
    background: var(--panel-2);
    padding: 10px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: var(--mono);
    font-size: 0.85rem;
  }
  code {
    font-family: var(--mono);
    font-size: 0.9em;
    background: var(--panel-2);
    padding: 0 4px;
    border-radius: 4px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px 6px 0;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 6px;
    background: hsl(var(--hue) 65% 50%);
  }
  .stroke {
    display: inline-block;
    margin-right: 10px;
    white-space: nowrap;
  }
  @media (max-width: 600px) {
    td:nth-child(2),
    th:nth-child(2) {
      display: none;
    }
  }
</style>
