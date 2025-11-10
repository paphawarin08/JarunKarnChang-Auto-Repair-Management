import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import "../styles/SelectList.css";

const mockVehicles = [
  {
    id: "v1",
    title: "2023 102 IRONWORKS, INC.",
    plate: "กก5155",
    type: "Coupe",
    mileage: 8000,
    image: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?q=80&w=1000&auto=format&fit=crop",
  },
  {
    id: "v2",
    title: "2023 102 IRONWORKS, INC.",
    plate: "กก5155",
    type: "Coupe",
    mileage: 8000,
    image: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?q=80&w=1000&auto=format&fit=crop",
  },
];

export default function SelectVehicle() {
  const navigate = useNavigate();
  const choose = (item) => {
    navigate("/admin/repairs/new", { replace: true, state: { selectedVehicle: item } });
  };

  return (
    <div className="sl-wrap">
      <header className="sl-header">
        <button className="sl-back" onClick={() => navigate(-1)}><ArrowLeft size={26} /></button>
        <h1 className="sl-title">เลือกรถยนต์</h1>
      </header>

      <div className="sl-search">
        <Search size={20} />
        <input placeholder="Search by name, address, phone" />
      </div>

      <div className="sl-grid">
        {mockVehicles.map((v) => (
          <button key={v.id} className="sl-card sl-car" onClick={() => choose(v)}>
            <img className="sl-car-img" src={v.image} alt="" />
            <div className="sl-car-body">
              <div className="sl-name">{v.title}</div>
              <div className="sl-plate">{v.plate}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="sl-fab">
        <button className="sl-add">+ เพิ่มรถยนต์</button>
      </div>
    </div>
  );
}
