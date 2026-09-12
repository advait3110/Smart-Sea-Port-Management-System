const Footer = () => {
  return (
    <div className="flex w-full items-center justify-center px-1 pb-8 pt-3">

      <p className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 md:text-base">
        © {new Date().getFullYear()} Smart Sea Port Management System • Karwar Port Prototype
      </p>

    </div>
  );
};

export default Footer;