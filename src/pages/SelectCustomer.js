import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Phone, Mail, IdCard, MapPin, ChevronRight } from "lucide-react";
import "../styles/SelectList.css";

const mockCustomers = [
  {
    id: "c1",
    name: "KKK",
    phone: "0641686917",
    email: "luckky080@gmail.com",
    lineId: "luc.dssdf",
    address: "luc dssdf",
  },
  { id: "c2", name: "KKK", phone: "0641686917", email: "luckky080@gmail.com", lineId: "luc.dssdf", address: "luc dssdf" },
  { id: "c3", name: "KKK", phone: "0641686917", email: "luckky080@gmail.com", lineId: "luc.dssdf", address: "luc dssdf" },
];

export default function SelectCustomer() {
  const navigate = useNavigate();
  const choose = (item) => {
    navigate("/admin/repairs/new", { replace: true, state: { selectedCustomer: item } });
  };

  return (
    <div className="sl-wrap">
      <header className="sl-header">
        <button className="sl-back" onClick={() => navigate(-1)}><ArrowLeft size={26} /></button>
        <h1 className="sl-title">เลือกลูกค้า</h1>
      </header>

      <div className="sl-search">
        <Search size={20} />
        <input placeholder="Search by name, address, phone" />
      </div>

      <div className="sl-grid">
        {mockCustomers.map((c) => (
          <button className="sl-card" key={c.id} onClick={() => choose(c)}>
            <div className="sl-avatar">👔</div>
            <div className="sl-info">
              <div className="sl-name">{c.name}</div>
              <div className="sl-line"><Phone size={16} /> {c.phone}</div>
              <div className="sl-line"><Mail size={16} /> {c.email}</div>
              <div className="sl-line"><IdCard size={16} /> {c.email}</div>
              <div className="sl-line"><MapPin size={16} /> {c.address}</div>
            </div>
            <ChevronRight className="sl-next" size={18} />
          </button>
        ))}
      </div>

      <div className="sl-fab">
        <button className="sl-add">+ เพิ่มลูกค้า</button>
      </div>
    </div>
  );
}
