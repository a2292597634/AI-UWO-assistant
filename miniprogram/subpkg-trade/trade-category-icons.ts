const tradeCategoryIconPaths: Readonly<Record<string, string>> = {
  '01': '/subpkg-trade/assets/category-icons/01.png',
  '02': '/subpkg-trade/assets/category-icons/02.png',
  '03': '/subpkg-trade/assets/category-icons/03.png',
  '04': '/subpkg-trade/assets/category-icons/04.png',
  '05': '/subpkg-trade/assets/category-icons/05.png',
  '06': '/subpkg-trade/assets/category-icons/06.png',
  '07': '/subpkg-trade/assets/category-icons/07.png',
  '08': '/subpkg-trade/assets/category-icons/08.png',
  '09': '/subpkg-trade/assets/category-icons/09.png',
  '10': '/subpkg-trade/assets/category-icons/10.png',
  '11': '/subpkg-trade/assets/category-icons/11.png',
  '12': '/subpkg-trade/assets/category-icons/12.png',
  '13': '/subpkg-trade/assets/category-icons/13.png',
  '14': '/subpkg-trade/assets/category-icons/14.png',
  '15': '/subpkg-trade/assets/category-icons/15.png',
  '16': '/subpkg-trade/assets/category-icons/16.png',
  '17': '/subpkg-trade/assets/category-icons/17.png',
  '18': '/subpkg-trade/assets/category-icons/18.png',
  '19': '/subpkg-trade/assets/category-icons/19.png',
  '20': '/subpkg-trade/assets/category-icons/20.png',
}

export const getTradeCategoryIconPath = (categoryId: string): string | null =>
  tradeCategoryIconPaths[categoryId] ?? null
