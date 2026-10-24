"""Writes fixtures/evidence/: the documents an investigator may open. Plain text, deterministic."""
from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

import simcal as cal
import geo
from company import Company
from maintenance import ITEM_LABEL


def _auth(ref: str) -> str:
    return hashlib.sha1(ref.encode()).hexdigest()[:6].upper()


def _money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def write_receipts(out: Path, cards: list[dict], company: Company) -> None:
    d = out / "receipts"
    d.mkdir(parents=True, exist_ok=True)
    for x in cards:
        station = geo.STATION_BY_NAME[x["stationName"]]
        at = cal.parse_iso(x["at"]) if isinstance(x["at"], str) else x["at"]
        lines = [
            station.name.upper(),
            station.address,
            f"{cal.local_label(at)}",
            f"PUMP {int(x['id']) % 12 + 1:02d}   DIESEL #2",
            f"GALLONS      {x['gallons']:.3f}",
            f"PRICE/GAL    ${x['_price']:.4f}" if len(str(x['_price']).split('.')[-1]) > 3 else f"PRICE/GAL    ${x['_price']:.3f}",
            f"TOTAL        {_money(x['cents'])}",
            f"FLEET CARD   ****{x['cardId'][-4:]}   UNIT {x['truckId']}   DRIVER {x['driverId']}",
            f"AUTH {_auth(x['id'])}   REF {x['id']}",
        ]
        (d / f"{x['id']}.txt").write_text("\n".join(lines) + "\n")


def write_contracts(out: Path, contracts, company: Company) -> None:
    d = out / "contracts"
    d.mkdir(parents=True, exist_ok=True)
    vendors = {v.id: v for v in company.vendors}
    for c in contracts:
        v = vendors[c.vendorId]
        text = (
            f"SERVICE RATE AGREEMENT {c.id}\n"
            f"Vendor: {v.name}, {v.city} TX\n"
            f"Item: {c.item} ({ITEM_LABEL[c.item]})\n"
            f"Unit rate: {_money(c.rateCents)}\n"
            f"Valid: business day {c.validFromDay} ({cal.iso_date(c.validFromDay)}) to day {c.validToDay} ({cal.iso_date(c.validToDay)})\n"
            f"Tolerance: invoices above 105 percent of the unit rate are held for review.\n\n"
            f"{c.clause}\n"
        )
        (d / f"{c.id}.txt").write_text(text)


def write_invoices(out: Path, invoices: list[dict], pos: list[dict], company: Company) -> None:
    d = out / "invoices"
    d.mkdir(parents=True, exist_ok=True)
    vendors = {v.id: v for v in company.vendors}
    po_by_id = {p["id"]: p for p in pos}
    for i in invoices:
        v = vendors[i["vendorId"]]
        bank = v.bankLast4 if (v.bankChangedDay and i["receivedDay"] >= v.bankChangedDay) else (v.previousBankLast4 if v.bankChangedDay else v.bankLast4)
        po = po_by_id.get(i["poId"]) if i["poId"] else None
        lines = [
            f"{v.name.upper()}",
            f"{v.city}, TX",
            f"INVOICE {i['id']}",
            f"Date received: {cal.iso_date(i['receivedDay'])} (business day {i['receivedDay']})",
            f"Customer PO: {i['poId'] or 'none'}" + (f"   Unit: {po['truckId']}" if po else ""),
            "",
            f"{ITEM_LABEL.get(i['item'], i['item'].replace('_', ' ').title()):<40} qty {i['qty']:>3} x {_money(i['unitCents']):>10} = {_money(i['qty'] * i['unitCents']):>11}",
        ]
        if i["_fee"]:
            lines.append(f"{'Shop supplies and disposal':<40} {'':>3}   {'':>10}   {_money(i['_fee']):>11}")
        lines += ["", f"TOTAL DUE {_money(i['cents'])}", f"Remit to account ending {bank}", "Terms: net 15"]
        if v.bankChangedDay and i["receivedDay"] >= v.bankChangedDay:
            lines.append(f"NOTE: remit-to account updated on {cal.iso_date(v.bankChangedDay)}. Please update your records.")
        (d / f"{i['id']}.txt").write_text("\n".join(lines) + "\n")


def write_swap_log(out: Path, swaps, company: Company, po_hint: dict) -> None:
    lines = ["DISPATCH LOG - UNIT SWAPS (San Antonio desk, all terminals)", f"{'date':<12}{'driver':<30}{'from':<6}{'to':<6}reason", ""]
    rows = []
    for s in swaps:
        drv = company.driver(s.driver_id)
        last, first = drv.name.split()[-1], drv.name.split()[0]
        who = f"{last}, {first} (drv {s.driver_id})"
        reason = s.reason.replace("_", " ")
        po = po_hint.get(s.own_truck)
        reason_txt = f"unit {s.own_truck} in shop: {reason}" + (f" ({po})" if po else "")
        rows.append((s.d0, f"{cal.iso_date(s.d0):<12}{who:<30}{s.own_truck:<6}{s.relief_truck:<6}{reason_txt}; moved to unit {s.relief_truck} through {cal.iso_date(s.d1)}"))
        back = min(cal.TOTAL_DAYS, s.d1 + 1)
        rows.append((back, f"{cal.iso_date(back):<12}{who:<30}{s.relief_truck:<6}{s.own_truck:<6}unit {s.own_truck} back from shop; driver returns to own unit"))
    rows.sort(key=lambda r: (r[0], r[1]))
    lines += [r[1] for r in rows]
    (out / "swap_log.txt").write_text("\n".join(lines) + "\n")


def write_tolls(out: Path, tolls: list[dict]) -> None:
    """One notice per toll charge, the way an authority statement line reads. Not in the contract's list,
    but it gives the auto-rejected duplicates something a human can open."""
    d = out / "tolls"
    d.mkdir(parents=True, exist_ok=True)
    authority = {"TXTAG": "TxTag (Texas Department of Transportation)", "HCTRA": "Harris County Toll Road Authority",
                 "NTTA": "North Texas Tollway Authority"}
    for t in tolls:
        at = cal.parse_iso(t["at"]) if isinstance(t["at"], str) else t["at"]
        text = (f"TOLL CHARGE {t['id']}\n{authority[t['plazaId'].split('-')[0]]}\nPlaza: {t['plazaId']} {t['plazaName']}\n"
                f"Plate: {t['plate']} (unit {t['truckId']})\nTime: {cal.local_label(at)}\nClass: 5-axle commercial\n"
                f"Amount: {_money(t['cents'])}\n")
        (d / f"{t['id']}.txt").write_text(text)


def write_telematics(out: Path, pings: list[dict]) -> None:
    d = out / "telematics"
    d.mkdir(parents=True, exist_ok=True)
    by_day: dict[int, list[dict]] = {}
    for p in pings:
        by_day.setdefault(p["day"], []).append(p)
    for day in sorted(by_day):
        rows = sorted(by_day[day], key=lambda p: (p["truckId"], p["at"]))
        with (d / f"{day}.csv").open("w") as f:
            f.write("truckId,at,lat,lon,engineOn,odometer\n")
            for p in rows:
                at = p["at"] if isinstance(p["at"], str) else cal.iso(p["at"])
                f.write(f"{p['truckId']},{at},{p['lat']},{p['lon']},{'true' if p['engineOn'] else 'false'},{p['odometer']}\n")


def render_all(out_dir: Path, company: Company, cards, tolls, pings, contracts, pos, invoices, swaps, po_hint: dict) -> None:
    out = out_dir / "evidence"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    write_receipts(out, cards, company)
    write_tolls(out, tolls)
    write_contracts(out, contracts, company)
    write_invoices(out, invoices, pos, company)
    write_swap_log(out, swaps, company, po_hint)
    write_telematics(out, pings)
