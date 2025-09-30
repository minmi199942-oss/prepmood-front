// buy-script.js

const products = {
  shirt: {
    name: "Pre.p 셔츠",
    price: "₩500,000",
    image: "image/shirt.jpg",
    description: "고급 코튼 소재의 셔츠입니다."
  },
  denim: {
    name: "Pre.p 데님 자켓",
    price: "₩220,000",
    image: "image/denim.jpg",
    description: "빈티지한 워싱의 데님 자켓입니다."
  },
  hat: {
    name: "Pre.p 모자",
    price: "₩89,000",
    image: "image/hat.jpg",
    description: "베이직한 디자인의 모자입니다."
  },
  acc: {
    name: "Pre.p ACC",
    price: "₩59,000",
    image: "image/acc.jpg",
    description: "포인트가 되는 귀걸이 액세서리입니다."
  }
};

const params = new URLSearchParams(window.location.search);
const productId = params.get("id");

if (products[productId]) {
  const product = products[productId];
  document.getElementById("product-name").textContent = product.name;
  document.getElementById("product-price").textContent = product.price;
  document.getElementById("product-image").src = product.image;
  document.getElementById("product-description").textContent = product.description;
}
