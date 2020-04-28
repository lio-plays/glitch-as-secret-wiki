const path = location.pathname;
const htmltag = document.querySelector("#html");

async function fillPage() {
  // root ("/") redirects to last page.
  // because glitch loads "/" at refresh

  const urltag = document.querySelector("#url");
  const project = location.host.match(/(.*?)\./)[1];

  //save path for "/"

  const savepath = path + location.hash;
  localStorage.setItem("lastPath", savepath);
  urltag.textContent = `${savepath} _ @${project}`;
  document.title = `${savepath}@${project}`;

  // url from here to glitch-editor

  const glitchpath =
    path === "/" && location.hash !== ""
      ? location.hash.substring(2)
      : path.substring(1);
  urltag.href = `https://glitch.com/edit/#!/${project}?path=${glitchpath}`;

  // webedit link
  const webedittag = document.querySelector("#webedit");
  webedittag.href = `/webedit?file=${encodeURIComponent("/" + glitchpath)}`;

  // markdown

  const markdowntag = document.querySelector("#markdown");
  if (path === "/" && location.hash !== "") {
    htmltag.innerHTML = "<h1>Loading</h1>";
    const response = await fetch(new Request(location.hash.substring(1)));
    if (response.status === 200) {
      var src = await response.text();
    } else {
      var src = `Error ${response.status}. Goto [Index](index.html)`;
    }
  } else {
    var src = markdowntag.innerHTML;
  }

  const md = window.markdownit();
  const result = md.render(src);
  htmltag.innerHTML = result;
}

function fillFirstPage() {
  onhashchange = () => fillPage();
  fillPage();
}

try {
  if (path === "/" && location.hash === "") {
    const lastpath = localStorage.getItem("lastPath");
    if (
      lastpath === "/" || // just in case. would lead to recursion.
      lastpath === null
    ) {
      location.replace("index.html");
    } else {
      location.replace(lastpath);
      // with "/#something" no happens but location.hash is changed, so  fillPage works
      if (lastpath.match(/^\/#/)) {
        fillFirstPage();
      }
    }
  } else {
    fillFirstPage();
  }
} catch (e) {
  console.log(e);
  htmltag.innerHTML = "Something went wrong";
}
