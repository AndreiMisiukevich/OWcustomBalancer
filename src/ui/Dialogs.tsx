import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as A from "../logic/actions";
import { format_player_id, get_default_settings, print_date, round_to } from "../logic/common";
import { class_names, class_titles, ow_ranks, rank_division, rank_tier, sr_from_rank, SR_MAX } from "../logic/defines";
import { heroName, heroRole } from "./HoverCard";
import { export_lobby, export_teams } from "../logic/importExport";
import { S } from "../logic/state";
import type { Player, SettingsShape } from "../logic/types";
import { cancelBalance, clearStatsLog, dismissBalance, updatePlayerNow } from "./controller";
import { IconArrowDown, IconArrowUp, IconCopy, IconDownload, IconEdit, IconExternal, IconLock, IconRefresh, IconX, RankBadge, RoleIcon } from "./icons";
import { Field, Modal, Seg } from "./Modal";
import { Toggle } from "./Core";
import { prepareIconDataUris } from "./iconRaster";
import { closeDialog, highlight, rerender, toast, ui } from "./store";

function copyText(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast("Copied to clipboard", "ok", 1800),
    () => toast("Copy failed — select the text and press Ctrl+C", "warn"),
  );
}

function ImportDialog() {
  const [format, setFormat] = useState<"json" | "text">("text");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const r = A.import_players(format, text);
    if (!r) return;
    if (!r.ok) {
      setError(r.error);
      return;
    }
    closeDialog();
    if (r.added.length) {
      highlight(r.added.map((p) => p.id));
      toast(`Imported ${r.added.length} player${r.added.length == 1 ? "" : "s"}`, "ok");
    } else {
      toast("No new players (all already in the list)", "info");
    }
  };
  return (
    <Modal
      title="Import players"
      onClose={closeDialog}
      width={640}
      footer={
        <>
          <button className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Import
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Seg
          label="Import format"
          value={format}
          onChange={(v) => {
            setFormat(v);
            setError("");
          }}
          options={[
            ["text", "BattleTag list"],
            ["json", "JSON (full info)"],
          ]}
        />
      </div>
      <textarea className="field" rows={12} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={format == "text" ? "Player#1234\nOther#5678 2450 3100 1800 dps" : '{ "format_version": 5, "players": [...] }'} aria-label="Import data" />
      {format == "text" && (
        <p className="mt-2 text-[13px] text-muted">
          One player per line: <code className="text-text">BattleTag [tank SR, damage SR, support SR, main role]</code>. Fields can be separated by space, tab or <code>. , ; |</code>. SR and role are optional;
          players without SR are looked up via the stats API.
        </p>
      )}
      {error && <p className="mt-2 text-[14px] text-danger">{error}</p>}
    </Modal>
  );
}

function ExportLobbyDialog() {
  const [format, setFormat] = useState<"json" | "text" | "csv">("json");
  const text = useMemo(() => export_lobby(format), [format]);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.select();
    ref.current?.focus();
  }, [text]);
  return (
    <Modal
      title="Export players"
      subtitle={`${S.lobby.length} players in lobby`}
      onClose={closeDialog}
      width={680}
      footer={
        <>
          <button className="btn" onClick={() => copyText(text)}>
            <IconCopy size={15} /> Copy
          </button>
          <button className="btn btn-primary" onClick={closeDialog}>
            Done
          </button>
        </>
      }
    >
      <div className="mb-3">
        <Seg
          label="Export format"
          value={format}
          onChange={setFormat}
          options={[
            ["json", "JSON"],
            ["text", "BattleTags"],
            ["csv", "CSV"],
          ]}
        />
      </div>
      <textarea ref={ref} className="field" rows={14} value={text} readOnly aria-label="Exported data" />
    </Modal>
  );
}

const EXPORT_WRAP = 'style="display:inline-block;padding:8px;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:14px"';

function measureExport(inner: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:absolute;left:-10000px;top:0;width:4000px;height:4000px;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><body style="margin:0"><div ${EXPORT_WRAP}>${inner}</div></body></html>`);
  doc.close();
  const rect = (doc.body.firstElementChild as HTMLElement).getBoundingClientRect();
  frame.remove();
  return [Math.ceil(rect.width), Math.ceil(rect.height)];
}

async function renderTableImage(html: string): Promise<Blob | null> {
  const inner = html.replace(/<img([^>]*?)\/?>/g, "<img$1/>");
  const [w, h] = measureExport(inner);
  const data =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" ${EXPORT_WRAP}>${inner}</div></foreignObject></svg>`;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("render failed"));
    img.src = "data:image/svg+xml," + encodeURIComponent(data);
  });
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve));
}

function ExportTeamsDialog() {
  const [format, setFormat] = useState(S.ExportOptions.format);
  const [sr, setSr] = useState(S.ExportOptions.include_sr);
  const [classes, setClasses] = useState(S.ExportOptions.include_classes);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const out = useMemo(() => export_teams(format, true, sr, classes, false, 2), [format, sr, classes]);

  useEffect(() => {
    A.save_export_options(format, sr, classes);
    setImgUrl(null);
    if (format == "image") {
      let url: string | null = null;
      prepareIconDataUris()
        .then(() => renderTableImage(export_teams(format, true, sr, classes, false, 2)))
        .then((blob) => {
        if (blob) {
          url = URL.createObjectURL(blob);
          setImgUrl(url);
        }
      });
      return () => {
        if (url) URL.revokeObjectURL(url);
      };
    }
    if (format == "text-list") {
      textRef.current?.select();
      textRef.current?.focus();
    }
  }, [format, sr, classes, out]);

  const copyTable = async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([out], { type: "text/html" }),
          "text/plain": new Blob([htmlRef.current?.innerText ?? ""], { type: "text/plain" }),
        }),
      ]);
      toast("Table copied — paste into Excel or Google Sheets", "ok");
    } catch {
      const range = document.createRange();
      if (htmlRef.current) {
        range.selectNodeContents(htmlRef.current);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand("copy");
        toast("Table copied", "ok");
      }
    }
  };

  return (
    <Modal
      title="Export teams"
      onClose={closeDialog}
      width={760}
      footer={
        <>
          {format == "text-list" && (
            <button className="btn" onClick={() => copyText(out)}>
              <IconCopy size={15} /> Copy text
            </button>
          )}
          {format == "html-table" && (
            <button className="btn" onClick={copyTable}>
              <IconCopy size={15} /> Copy table
            </button>
          )}
          {format == "image" && imgUrl && (
            <a className="btn" href={imgUrl} download="teams.png">
              <IconDownload size={15} /> Download PNG
            </a>
          )}
          <button className="btn btn-primary" onClick={closeDialog}>
            Done
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Seg
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            ["text-list", "Text"],
            ["html-table", "Table"],
            ["image", "Image"],
          ]}
        />
        <label className="flex items-center gap-2 text-[14px]">
          <Toggle checked={sr} onChange={setSr} label="Include SR" /> SR / rank
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <Toggle checked={classes} onChange={setClasses} label="Include roles" /> Roles
        </label>
      </div>
      {format == "text-list" && <textarea ref={textRef} className="field" rows={14} value={out} readOnly aria-label="Teams as text" />}
      {format == "html-table" && <div ref={htmlRef} className="export-html" dangerouslySetInnerHTML={{ __html: out }} />}
      {format == "image" && (
        <div className="export-html grid min-h-[120px] place-items-center">
          {imgUrl ? <img src={imgUrl} alt="Team compositions" /> : <span className="text-[13px] text-gray-500">Rendering…</span>}
        </div>
      )}
      {format == "image" && <p className="mt-2 text-[12px] text-faint">Right-click the image to copy it, or download the PNG.</p>}
    </Modal>
  );
}

function clampSr(raw: string) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, SR_MAX);
}

function RankPicker({ sr, onChange }: { sr: number; onChange: (sr: number) => void }) {
  const tier = rank_tier(sr);
  const division = rank_division(sr) || 5;
  return (
    <div className="flex items-center gap-1.5">
      <RankBadge sr={sr} size={30} />
      <select
        className="field !h-8 !w-[120px] !px-2 !text-[13px]"
        value={tier.key}
        aria-label="Rank"
        onChange={(e) => onChange(e.target.value == "unranked" ? 0 : sr_from_rank(e.target.value, division))}
      >
        {ow_ranks.map((t) => (
          <option key={t.key} value={t.key}>
            {t.title}
          </option>
        ))}
      </select>
      <select
        className="field !h-8 !w-[52px] !px-2 !text-[13px]"
        value={tier.key == "unranked" ? "" : division}
        disabled={tier.key == "unranked"}
        aria-label="Division"
        onChange={(e) => onChange(sr_from_rank(tier.key, Number(e.target.value)))}
      >
        {tier.key == "unranked" && <option value="">–</option>}
        {[5, 4, 3, 2, 1].map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditPlayerDialog({ player, nonce }: { player: Player; nonce: number }) {
  const [name, setName] = useState(player.display_name);
  const [rows, setRows] = useState(() => A.edit_dialog_rows(player));
  const [pinned, setPinned] = useState(S.pinned_players.has(player.id));
  const [checkin, setCheckin] = useState(S.checkin_list.has(player.id));
  const [, force] = useState(0);

  useEffect(() => {
    setName(player.display_name);
    setRows(A.edit_dialog_rows(player));
    setPinned(S.pinned_players.has(player.id));
    setCheckin(S.checkin_list.has(player.id));
  }, [nonce, player]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const clearMark = (field: "ne" | "se" | "ce") => {
    A.clear_edited_mark(player, field);
    force((x) => x + 1);
    rerender();
  };
  const ok = () => {
    A.edit_player_ok(player, { display_name: name, rows, pinned, checkin });
    closeDialog();
  };
  const careerUrl = `https://overwatch.blizzard.com/en-us/career/${encodeURIComponent(player.id)}/`;

  return (
    <Modal
      title={player.display_name || player.id}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {player.private_profile && (
            <span className="chip !h-5 text-muted" title="Private profile">
              <IconLock size={12} /> Private
            </span>
          )}
          <a href={careerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-t1 hover:underline">
            {player.id} <IconExternal size={12} />
          </a>
        </span>
      }
      onClose={closeDialog}
      width={720}
      footer={
        <>
          <button className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={ok}>
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <Field
          label={
            <span className="flex items-center gap-2">
              Name
              {player.ne === true && (
                <button className="chip !h-5 !text-[11px] text-brand-2" title="Name was edited manually and won't be overwritten by stats. Click to allow updates." onClick={() => clearMark("ne")}>
                  <IconEdit size={11} /> edited <IconX size={11} />
                </button>
              )}
            </span>
          }
        >
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
        </Field>
        <Field label="Pinned">
          <div className="flex h-[38px] items-center" title="Pinned players stay in their team when the team is cleared">
            <Toggle checked={pinned} onChange={setPinned} label="Pinned" />
          </div>
        </Field>
        <Field label="Checked in">
          <div className="flex h-[38px] items-center">
            <Toggle checked={checkin} onChange={setCheckin} label="Checked in" />
          </div>
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <span className="hud-label">Roles &amp; ranks</span>
        <span className="text-[12px] text-faint">top row = main role · unchecked roles are ignored by the balancer</span>
        <span className="ml-auto flex gap-1.5">
          {player.se === true && (
            <button className="chip !h-5 !text-[11px] text-brand-2" title="SR was edited manually. Click to allow stats updates." onClick={() => clearMark("se")}>
              SR edited <IconX size={11} />
            </button>
          )}
          {player.ce === true && (
            <button className="chip !h-5 !text-[11px] text-brand-2" title="Roles were edited manually. Click to allow stats updates." onClick={() => clearMark("ce")}>
              Roles edited <IconX size={11} />
            </button>
          )}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {rows.map((row, i) => (
            <motion.div
              layout
              key={row.class_name}
              className={"flex flex-wrap items-center gap-x-3 gap-y-2 border border-line bg-ink-900/60 px-3 py-2 transition-opacity" + (row.enabled ? "" : " opacity-45")}
              style={{ clipPath: "polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)" }}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#ff9a1f]"
                checked={row.enabled}
                aria-label={`Use ${class_titles[row.class_name as keyof typeof class_titles]} role`}
                onChange={(e) => setRows(rows.map((r, k) => (k == i ? { ...r, enabled: e.target.checked } : r)))}
              />
              <span className="flex w-[104px] items-center gap-2">
                <RoleIcon role={row.class_name} size={20} />
                <span className="font-display text-[16px] font-bold uppercase">{class_titles[row.class_name as keyof typeof class_titles]}</span>
              </span>
              <RankPicker sr={Number(row.sr) || 0} onChange={(v) => setRows(rows.map((r, k) => (k == i ? { ...r, sr: v } : r)))} />
              <input
                className="field !h-8 !w-[78px] !px-2 !text-[14px]"
                type="number"
                min={0}
                max={SR_MAX - 1}
                value={row.sr}
                aria-label={`${row.class_name} SR`}
                onChange={(e) => setRows(rows.map((r, k) => (k == i ? { ...r, sr: clampSr(e.target.value) } : r)))}
              />
              <span className="w-[70px] text-[12px] text-faint">{player.playtime_by_class[row.class_name] ?? 0} hrs</span>
              <span className="ml-auto flex">
                <button className="icon-btn !h-7 !w-7" aria-label="Move role up" onClick={() => move(i, -1)} disabled={i == 0}>
                  <IconArrowUp size={14} />
                </button>
                <button className="icon-btn !h-7 !w-7" aria-label="Move role down" onClick={() => move(i, 1)} disabled={i == rows.length - 1}>
                  <IconArrowDown size={14} />
                </button>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {player.top_heroes.length > 0 && (
        <div className="mt-5">
          <div className="hud-label mb-2">Top heroes</div>
          <div className="flex flex-wrap gap-2">
            {player.top_heroes.map((h) => (
              <span key={h.hero} className="chip !h-7 !text-[14px]">
                {heroRole(h.hero) && <RoleIcon role={heroRole(h.hero)} size={14} />}
                {heroName(h.hero)}
                <span className="text-faint">{h.playtime} h</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <div className="text-[13px] text-muted">
          Stats updated: <span className="text-text">{print_date(player.last_updated)}</span>
          {player.level ? <span className="ml-3">Level {player.level}</span> : null}
        </div>
        <button className="btn btn-sm ml-auto" onClick={() => updatePlayerNow(player)} disabled={ui.stats.editorLoading}>
          <IconRefresh size={13} className={ui.stats.editorLoading ? "animate-spin" : ""} /> {ui.stats.editorLoading ? "Updating…" : "Update stats"}
        </button>
      </div>
      {ui.stats.editorResult && <p className="mt-2 text-[13px] text-danger">{ui.stats.editorResult}</p>}
    </Modal>
  );
}

function SettingsDialog() {
  const [form, setForm] = useState<SettingsShape>(() => JSON.parse(JSON.stringify(S.Settings)));
  const set = <K extends keyof SettingsShape>(k: K, v: SettingsShape[K]) => setForm((f) => ({ ...f, [k]: v }));
  const teamSize = Object.values(form.slots_count).reduce((a, b) => a + Number(b), 0);
  const problems: string[] = [];
  if (class_names.some((c) => !Number.isInteger(Number(form.slots_count[c])) || form.slots_count[c] < 0 || form.slots_count[c] > 12)) problems.push("Role slots must be whole numbers from 0 to 12.");
  if (teamSize < 1) problems.push("A team needs at least one slot.");
  if (form.adjust_sr && (["tank", "dps", "support"] as const).some((c) => !(form[`adjust_${c}`] >= 0 && form[`adjust_${c}`] <= 999))) problems.push("Role weights must be between 0% and 999%.");
  if (!(form.update_picked_maxage >= 0)) problems.push("Stats age must be 0 days or more.");
  const apply = () => {
    if (problems.length) return;
    A.apply_settings(form);
    closeDialog();
  };
  return (
    <Modal
      title="Settings"
      onClose={closeDialog}
      width={820}
      footer={
        <>
          <button className="btn btn-ghost mr-auto" onClick={() => setForm(get_default_settings())}>
            Restore defaults
          </button>
          <button className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          {problems.length > 0 && <span className="mr-auto text-[13px] text-danger">{problems[0]}</span>}
          <button className="btn btn-primary" onClick={apply} disabled={problems.length > 0}>
            Apply
          </button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-4">
          <div className="hud-label !text-brand">Teams</div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="hud-label">Role slots per team</span>
              <span className="text-[13px] text-muted">
                {teamSize}v{teamSize}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {class_names.map((c) => (
                <label key={c} className="flex items-center gap-2 border border-line bg-ink-900/60 px-2 py-1.5">
                  <RoleIcon role={c} size={18} />
                  <input
                    className="w-full bg-transparent font-display text-[20px] font-bold focus:outline-none"
                    type="number"
                    min={0}
                    max={12}
                    value={form.slots_count[c]}
                    aria-label={`${class_titles[c]} slots`}
                    onChange={(e) => set("slots_count", { ...form.slots_count, [c]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button className="btn btn-sm" onClick={() => set("slots_count", { tank: 1, dps: 2, support: 2 })}>
                5v5 · 1-2-2
              </button>
              <button className="btn btn-sm" onClick={() => set("slots_count", { tank: 2, dps: 2, support: 2 })}>
                6v6 · 2-2-2
              </button>
            </div>
          </div>
          <Field label="Balancer algorithm">
            <select className="field" value={form.balancer_alg} onChange={(e) => set("balancer_alg", e.target.value)}>
              <option value="rolelockfallback">Role lock, fall back to no-roles</option>
              <option value="rolelock">Role lock only</option>
              <option value="classic">No role lock (classic)</option>
            </select>
          </Field>
          <label className="flex items-center justify-between gap-3">
            <span className="text-[14px]">Keep one-tricks of the same hero in different teams</span>
            <Toggle checked={form.separate_otps} onChange={(v) => set("separate_otps", v)} label="Separate one-tricks" />
          </label>
          <div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[14px]">Weight player SR by role</span>
              <Toggle checked={form.adjust_sr} onChange={(v) => set("adjust_sr", v)} label="Adjust SR by role" />
            </label>
            <div className={"mt-2 grid grid-cols-3 gap-2 transition-opacity" + (form.adjust_sr ? "" : " pointer-events-none opacity-40")}>
              {(["tank", "dps", "support"] as const).map((c) => (
                <label key={c} className="flex items-center gap-1.5 border border-line bg-ink-900/60 px-2 py-1.5">
                  <RoleIcon role={c} size={16} />
                  <input
                    className="w-full bg-transparent font-display text-[17px] font-bold focus:outline-none"
                    type="number"
                    min={0}
                    max={999}
                    disabled={!form.adjust_sr}
                    value={form[`adjust_${c}`]}
                    aria-label={`${class_titles[c]} SR weight`}
                    onChange={(e) => set(`adjust_${c}`, Number(e.target.value))}
                  />
                  <span className="text-faint">%</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="hud-label !text-brand">Balance priority</div>
          <div>
            <div className="mb-1 text-[14px]">With role lock</div>
            <input className="range" type="range" min={0} max={100} value={form.balance_priority_rolelock} onChange={(e) => set("balance_priority_rolelock", Number(e.target.value))} aria-label="Role lock balance priority" />
            <div className="mt-1 flex justify-between text-[12px] text-faint">
              <span>Equal SR</span>
              <span>{form.balance_priority_rolelock}</span>
              <span>Players on main role</span>
            </div>
          </div>
          <div>
            <div className="mb-1 text-[14px]">Without role lock</div>
            <input className="range" type="range" min={0} max={100} value={form.balance_priority} onChange={(e) => set("balance_priority", Number(e.target.value))} aria-label="Classic balance priority" />
            <div className="mt-1 flex justify-between text-[12px] text-faint">
              <span>Equal SR</span>
              <span>{form.balance_priority}</span>
              <span>Equal roles</span>
            </div>
          </div>
          <Field label="Player SR without role lock">
            <select className="field" value={form.sr_calc_method} onChange={(e) => set("sr_calc_method", e.target.value)}>
              <option value="main">Main role</option>
              <option value="max">Highest role</option>
              <option value="average">Average of roles</option>
              <option value="weighted">Average weighted by playtime</option>
            </select>
          </Field>

          <div className="hud-label mt-2 !text-brand">Stats</div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px]">Ranks from platform</span>
            <Seg
              label="Platform"
              value={form.platform as "pc" | "console"}
              onChange={(v) => set("platform", v)}
              options={[
                ["pc", "PC"],
                ["console", "Console"],
              ]}
            />
          </div>
          {(
            [
              ["update_sr", "Update ranks"],
              ["update_class", "Update roles"],
              ["update_edited_fields", "Overwrite manually edited name, SR and roles"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-3">
              <span className="text-[14px]">{l}</span>
              <Toggle checked={form[k]} onChange={(v) => set(k, v)} label={l} />
            </label>
          ))}
          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-wrap items-center gap-1.5 text-[14px]">
              Refresh picked players older than
              <input
                className="field !h-7 !w-[64px] !px-2 !text-[14px]"
                type="number"
                min={0}
                max={9999}
                value={form.update_picked_maxage}
                onChange={(e) => set("update_picked_maxage", Number(e.target.value))}
                aria-label="Max stats age in days"
              />
              days
            </span>
            <Toggle checked={form.update_picked} onChange={(v) => set("update_picked", v)} label="Refresh picked players" />
          </div>
        </section>
      </div>
    </Modal>
  );
}

function convert_range_log_scale(raw_value: number, out_min: number, out_max: number, precision = 0, input_range = 100) {
  return round_to(Math.pow(2, Math.log2(out_min) + ((Math.log2(out_max) - Math.log2(out_min)) * raw_value) / input_range), precision);
}

function StatsUpdateDialog({ scope }: { scope: "all" | "active" }) {
  const [raw, setRaw] = useState(43);
  const days = convert_range_log_scale(raw, 1, 3000) - 1;
  const date = new Date(Date.now() - days * 24 * 3600 * 1000);
  return (
    <Modal
      title="Update stats"
      subtitle={scope == "all" ? "All players in lobby and teams" : "Players in both teams"}
      onClose={closeDialog}
      width={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              closeDialog();
              A.update_stats(scope, days);
              rerender();
            }}
          >
            Update
          </button>
        </>
      }
    >
      <div className="text-[15px]">
        Update stats older than <b className="font-display text-[20px] text-brand">{days}</b> days
      </div>
      <input className="range mt-3" type="range" min={0} max={100} value={raw} onChange={(e) => setRaw(Number(e.target.value))} aria-label="Stats age" />
      <p className="mt-3 text-[13px] text-muted">Stats fetched before {date.toLocaleDateString()} will be refreshed. Requests are spaced out to respect the API rate limit.</p>
    </Modal>
  );
}

function StatsLogDialog() {
  return (
    <Modal
      title="Stats log"
      onClose={closeDialog}
      width={640}
      footer={
        <>
          <button className="btn btn-ghost" onClick={clearStatsLog}>
            Clear log
          </button>
          <button className="btn btn-primary" onClick={closeDialog}>
            Close
          </button>
        </>
      }
    >
      <textarea className="field" rows={14} readOnly value={ui.stats.log} aria-label="Stats update log" />
    </Modal>
  );
}

function CheckinDialog() {
  const [sort, setSort] = useState<{ col: 0 | 1; asc: boolean }>({ col: 1, asc: true });
  const [, force] = useState(0);
  const rows = useMemo(() => {
    const list = S.lobby.map((p) => ({ id: p.id, tag: format_player_id(p.id), checked: S.checkin_list.has(p.id) }));
    const order = sort.asc ? 1 : -1;
    list.sort((a, b) => {
      const va = sort.col == 0 ? Number(a.checked) : a.tag.toLowerCase();
      const vb = sort.col == 0 ? Number(b.checked) : b.tag.toLowerCase();
      return order * (va < vb ? -1 : va > vb ? 1 : 0);
    });
    return list;
  }, [sort]);
  const toggle = (id: string) => {
    A.set_checkin(id, !S.checkin_list.has(id));
    force((x) => x + 1);
    rerender();
  };
  const header = (col: 0 | 1, label: string) => (
    <th onClick={() => setSort((s) => ({ col, asc: s.col == col ? !s.asc : true }))} aria-sort={sort.col == col ? (sort.asc ? "ascending" : "descending") : "none"}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.col == col && (sort.asc ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
      </span>
    </th>
  );
  return (
    <Modal
      title="Manual check-in"
      subtitle={`${S.checkin_list.size} checked in · ${S.lobby.length} in lobby`}
      onClose={closeDialog}
      width={520}
      footer={
        <button className="btn btn-primary" onClick={closeDialog}>
          Done
        </button>
      }
    >
      <div className="max-h-[55vh] overflow-y-auto border border-line">
        <table className="tbl">
          <thead>
            <tr>
              {header(0, "In")}
              {header(1, "BattleTag")}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const checked = S.checkin_list.has(r.id);
              return (
                <tr key={r.id} className={"cursor-pointer hover:bg-white/5" + (checked ? " checked" : "")} onClick={() => toggle(r.id)}>
                  <td className="w-10">
                    <input type="checkbox" className="h-4 w-4 accent-[#4be3a1]" checked={checked} readOnly aria-label={`Check in ${r.tag}`} />
                  </td>
                  <td className="font-display text-[16px] font-semibold">{r.tag}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length == 0 && <div className="p-6 text-center text-[14px] text-faint">Lobby is empty.</div>}
      </div>
    </Modal>
  );
}

function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm }: { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }) {
  return (
    <Modal
      title={title}
      onClose={closeDialog}
      width={460}
      accent={danger ? "#ff5168" : undefined}
      footer={
        <>
          <button className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button
            className={"btn " + (danger ? "btn-danger !bg-[#a3132d]" : "btn-primary")}
            autoFocus
            onClick={() => {
              closeDialog();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[15px] text-muted">{message}</p>
    </Modal>
  );
}

const GUIDE: { title: string; body: React.ReactNode }[] = [
  {
    title: "Add players",
    body: (
      <>
        Type a BattleTag like <b>Name#1234</b> at the top. Ranks, role playtime and top heroes come from the OverFast API (public profiles only). If the lookup fails you can still add the player by hand. Big lists go
        through <b>Import</b> in the lobby.
      </>
    ),
  },
  {
    title: "Build the teams",
    body: (
      <>
        Drag cards between the lobby and team slots, or double-click to send a player to the next free slot and back. While you drag, slots that fit the player's roles light up. <b>Fill</b> picks random players
        from the lobby, using only checked-in players if anyone is checked in.
      </>
    ),
  },
  {
    title: "Balance",
    body: (
      <>
        <b>Balance</b> tries every split and picks one of the most even. Press it again for another variant. With role lock on, players are placed into tank, damage and support slots; the gap meter shows how close
        the teams are.
      </>
    ),
  },
  {
    title: "Edit a player",
    body: (
      <>
        Right-click a card (or focus it and press <b>E</b>) to set rank and division per role, reorder roles (top is main), pin the player to their team or mark them checked in. Manually edited values are protected from
        stats updates until you clear the mark.
      </>
    ),
  },
  {
    title: "Share the result",
    body: (
      <>
        <b>Export</b> gives the teams as plain text for chat, a table you can paste into a spreadsheet, or a PNG. The lobby exports to JSON, a BattleTag list or CSV.
      </>
    ),
  },
  {
    title: "Settings",
    body: (
      <>
        Switch between 5v5 and 6v6 or set any slot count, choose how strongly the balancer favors equal SR versus players on their main role, keep one-tricks apart, and pick PC or console ranks.
      </>
    ),
  },
];

function InfoDialog() {
  return (
    <Modal
      title="How it works"
      subtitle="A team balancer for Overwatch custom games. Everything stays in this browser."
      onClose={closeDialog}
      width={860}
      footer={
        <button className="btn btn-primary" onClick={closeDialog}>
          Got it
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {GUIDE.map((g, i) => (
          <motion.div
            key={g.title}
            className="relative border border-line bg-ink-900/60 p-4 pl-[60px]"
            style={{ clipPath: "polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.3 }}
          >
            <span className="absolute left-4 top-4 grid h-9 w-8 place-items-center font-display text-[17px] font-extrabold text-[#1b0d00] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)] bg-gradient-to-b from-brand-2 to-brand">
              {i + 1}
            </span>
            <div className="font-display text-[18px] font-bold uppercase tracking-[0.06em]">{g.title}</div>
            <p className="mt-1 text-[14px] leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-text">{g.body}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="hud-label mb-2 !text-brand">Ranks and SR</div>
          <p className="text-[14px] leading-relaxed text-muted">
            The game shows ranks, not numbers, so the balancer converts them: each rank is 500 SR and each division 100 SR, from Bronze (500) to Champion (4999). Gold 3 is 1750, Diamond 1 is 3450. It is an
            approximation that keeps neighbouring ranks in the right order.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {ow_ranks.slice(1).map((t) => (
              <span key={t.key} className="flex items-center gap-1 text-[12px] text-muted">
                <RankBadge sr={t.min + 1} size={22} showDivision={false} />
                {t.title}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="hud-label mb-2 !text-brand">Shortcuts</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
            {[
              ["Double-click", "Move to a free slot or back to the lobby"],
              ["Right-click", "Edit player"],
              ["Enter", "Move the focused player"],
              ["E", "Edit the focused player"],
              ["Esc", "Close a dialog or cancel a drag"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="chip !h-6 !text-[12px]">{k}</kbd>
                </dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
        <div className="hud-label mb-1.5">About &amp; credits</div>
        Based on{" "}
        <a className="text-t1 hover:underline" href="https://github.com/adminimusRU/OWcustomBalancer" target="_blank" rel="noreferrer">
          OWcustomBalancer
        </a>{" "}
        by adminimusRU (MIT); the balancing algorithm is unchanged. Stats from the{" "}
        <a className="text-t1 hover:underline" href="https://overfast-api.tekrop.fr" target="_blank" rel="noreferrer">
          OverFast API
        </a>
        . Background photo “Ciudad de las artes y las ciencias” by Nan Palmero,{" "}
        <a className="text-t1 hover:underline" href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noreferrer">
          CC BY 2.0
        </a>
        , resized and color-graded. Fonts: Saira Condensed and Barlow (SIL OFL). Icons and badges are original. Not affiliated with or endorsed by Blizzard Entertainment; Overwatch is a trademark of Blizzard
        Entertainment, Inc.
      </div>
    </Modal>
  );
}

export function BalanceOverlay() {
  const b = ui.balance;
  return (
    <AnimatePresence>
      {b.visible && (
        <motion.div className="modal-backdrop scan grid place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="flex flex-col items-center text-center" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.05, opacity: 0 }}>
            <div className="relative grid h-[200px] w-[200px] place-items-center">
              <svg width="200" height="200" viewBox="0 0 200 200" className="absolute inset-0" aria-hidden="true">
                <defs>
                  <linearGradient id="bo" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#2bb8ff" />
                    <stop offset="1" stopColor="#ff9a1f" />
                  </linearGradient>
                </defs>
                <circle cx="100" cy="100" r="88" fill="none" stroke="rgb(150 180 255 / .12)" strokeWidth="8" />
                <circle
                  cx="100"
                  cy="100"
                  r="88"
                  fill="none"
                  stroke="url(#bo)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - b.progress / 100)}
                  transform="rotate(-90 100 100)"
                  style={{ transition: "stroke-dashoffset .3s" }}
                />
                <g className="ring-busy" style={{ transformOrigin: "100px 100px" }}>
                  <circle cx="100" cy="100" r="72" fill="none" stroke="rgb(255 255 255 / .25)" strokeWidth="1.5" strokeDasharray="10 16" />
                </g>
              </svg>
              {b.phase == "running" ? (
                <div>
                  <div className="font-display text-[48px] font-extrabold leading-none">{b.progress}%</div>
                  <div className="hud-label mt-1">Searching</div>
                </div>
              ) : (
                <div className="font-display text-[22px] font-extrabold uppercase leading-tight text-danger">
                  No balance
                  <br />
                  found
                </div>
              )}
            </div>
            {b.phase == "running" ? (
              <>
                <p className="mt-4 max-w-sm text-[14px] text-muted">Checking every split of players and roles. Big role pools in 6v6 can take a while.</p>
                <button className="btn mt-4" onClick={cancelBalance}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p className="mt-4 max-w-sm text-[14px] text-muted">Both teams need enough players, and their roles must be able to fill every slot. Fill the teams or switch role lock off.</p>
                <button className="btn btn-primary mt-4" onClick={dismissBalance}>
                  OK
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Dialogs() {
  const d = ui.dialog;
  return (
    <AnimatePresence>
      {d.kind == "import" && <ImportDialog key="import" />}
      {d.kind == "exportLobby" && <ExportLobbyDialog key="exportLobby" />}
      {d.kind == "exportTeams" && <ExportTeamsDialog key="exportTeams" />}
      {d.kind == "settings" && <SettingsDialog key="settings" />}
      {d.kind == "edit" && <EditPlayerDialog key={"edit" + d.player.id} player={d.player} nonce={d.nonce} />}
      {d.kind == "statsUpdate" && <StatsUpdateDialog key="statsUpdate" scope={d.scope} />}
      {d.kind == "statsLog" && <StatsLogDialog key="statsLog" />}
      {d.kind == "checkin" && <CheckinDialog key="checkin" />}
      {d.kind == "confirm" && <ConfirmDialog key="confirm" {...d} />}
      {d.kind == "info" && <InfoDialog key="info" />}
    </AnimatePresence>
  );
}
